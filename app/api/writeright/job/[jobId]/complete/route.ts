import { logError, logEvent } from "@/lib/writeright-logger";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

// Note: Ensure AIJobResult matches the expected structure.
interface AIJobResult {
  improved_text: string;
  english_version?: string;
  teaching: {
    mistakes: string[];
    better_versions: string[];
    explanations: string[];
  };
  follow_up: string;
  suggestions: string[];
  scores: {
    clarity: number;
    tone: number;
    impact: number;
    verdict: string;
  };
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.job.complete", async () => {
      const { jobId } = await params;
      addSpanAttributes({ "writeright.job_id": jobId });

      const secretHeader = req.headers.get("X-Worker-Secret") || "";
      const expectedSecret = process.env.WRITERIGHT_WORKER_SECRET || "fallback-secret";

      const sig1 = Buffer.from(secretHeader);
      const sig2 = Buffer.from(expectedSecret);

      if (sig1.length !== sig2.length || !timingSafeEqual(sig1, sig2)) {
        throw createApiError("UNAUTHORIZED", "Invalid worker secret", 401);
      }

      let body: {
        result: AIJobResult;
        prompt_tokens: number;
        completion_tokens: number;
        model: string;
        duration_ms: number;
      };

      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const { result, prompt_tokens, completion_tokens, model } = body;

      const supabase = getSupabaseAdmin();

      const { data: job, error: jobError } = await supabase
        .from("writeright_ai_jobs")
        .select("chat_id, user_id, message_id, metadata")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        throw createApiError("NOT_FOUND", "Job not found", 404);
      }

      // Update DB
      await supabase.from("writeright_ai_jobs").update({
        status: "completed",
        output: result,
      }).eq("id", jobId);

      // Update Usage
      await supabase.from("writeright_usage").insert({
        user_id: job.user_id,
        job_id: jobId,
        chat_id: job.chat_id,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      });

      // ─────────────────────────────────────────────────────────────────────
      // Record writing session — this is what powers analytics.
      // Non-fatal: failure here must not block the job completion response.
      // ─────────────────────────────────────────────────────────────────────
      try {
        const clarity = result.scores?.clarity ?? 7;
        const tone = result.scores?.tone ?? 7;
        const impact = result.scores?.impact ?? 7;
        const totalTokens = prompt_tokens + completion_tokens;
        const mode = (job.metadata as Record<string, unknown>)?.mode as string ?? "email";
        const wordCount = result.improved_text
          ? result.improved_text.split(/\s+/).filter(Boolean).length
          : 0;

        const { error: sessionError } = await supabase.rpc("upsert_writing_session", {
          p_user_id: job.user_id,
          p_clarity: clarity,
          p_tone: tone,
          p_impact: impact,
          p_tokens: totalTokens,
          p_mode: mode,
          p_word_count: wordCount,
        });

        if (sessionError) {
          logError("[api.writeright.job.complete] upsert_writing_session failed", {
            error: sessionError.message,
            job_id: jobId,
            user_id: job.user_id,
          });
        }
      } catch (sessionErr) {
        logError("[api.writeright.job.complete] session recording threw", {
          error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
          ...traceLogFields(),
        });
      }

      // Update Redis status and stream result
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();

          // Publish result to stream
          const streamKey = ns("writeright", "job", "result", jobId);
          await redis.xadd(streamKey, "MAXLEN", "~", 1000, "*", "data", JSON.stringify(result));
          await redis.expire(streamKey, 3600);

          // Update status hash
          const statusKey = ns("writeright", "job", "status", jobId);
          await redis.hset(statusKey, { status: "completed", updated_at: new Date().toISOString() });

          // Cache result
          const cacheKey = ns("writeright", "cache", jobId);
          await redis.setex(cacheKey, 3600, JSON.stringify(result));

          // Invalidate analytics + stats caches so next fetch reflects new session
          await Promise.allSettled([
            redis.del(ns("writeright", "stats", job.user_id)),
            redis.del(ns("writeright", "analytics", job.user_id)),
            redis.del(ns("writeright", "session-stats", job.user_id)),
          ]);
        } catch (err) {
          logError("[api.writeright.job.complete] Redis update failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      return NextResponse.json({ received: true });
    });
  });
}
