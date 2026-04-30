// FILE: app/api/writeright/message/route.ts — Core WriteRight message processing
// ── CHANGED: [BE-3] Rate limit headers + [BE-1] centralized error handling ──
//
// POST — Submit a user message for AI improvement

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateUserQuota } from "@/app/api/writeright/quota/route";
import {
  enqueueWriteRightJob,
  checkRateLimit,
  computeInputHash,
  getCachedAIResponse,
  getIdempotentResponse,
  setIdempotentResponse,
  type WritingJobPayload,
  type AIJobResult,
} from "@/lib/writeright-queue";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
  injectTraceContext,
} from "@/lib/tracing";
import { withErrorHandler, createApiError, type ErrorCode } from "@/lib/writeright-errors";
import { MessageSchema } from "@/lib/writeright-validators";

// ---------------------------------------------------------------------------
// Input Sanitization
// ---------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 10_000;
const HISTORY_LIMIT = 6;
const IDEMPOTENCY_KEY_MAX_LENGTH = 120;

function sanitizeInput(text: string): string {
  let sanitized = text.slice(0, MAX_TEXT_LENGTH);
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return sanitized.normalize("NFC");
}

function getMaxRequestsPerMinute(): number {
  const envVal = parseInt(process.env.WRITERIGHT_RATE_LIMIT_PER_MINUTE ?? "10", 10);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 10;
}

function normalizeIdempotencyKey(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().slice(0, IDEMPOTENCY_KEY_MAX_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

function extractAssistantHistoryContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { improved_text?: unknown };
    if (typeof parsed.improved_text === "string" && parsed.improved_text.trim()) {
      return parsed.improved_text;
    }
  } catch {
    // Fall back to raw content when the assistant payload isn't structured JSON.
  }
  return content;
}

async function fetchChatHistory(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chatId: string,
  currentMessageId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data, error } = await supabase
    .from("writeright_messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .neq("id", currentMessageId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error || !data) {
    console.error("[api.writeright.message] History lookup failed:", {
      error: error?.message,
      ...traceLogFields(),
    });
    return [];
  }

  return data
    .slice()
    .reverse()
    .map((row): { role: "user" | "assistant"; content: string } => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.role === "assistant"
        ? extractAssistantHistoryContent(row.content)
        : row.content,
    }))
    .filter((entry) => entry.content.trim().length > 0);
}

// ── NEW: [BE-3] Helper to build rate limit response headers ──
function buildRateLimitHeaders(
  limit: number,
  remaining: number,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": (Math.floor(Date.now() / 1000) + 60).toString(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/writeright/message — Submit message for AI improvement
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.message.post", async () => {
      // 1. Authenticate
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      // 2. Parse body
      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      // 3. Validate fields
      const parsed = MessageSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, {
          issues: parsed.error.issues,
        });
      }

      const {
        chatId,
        text: rawText,
        tone,
        mode,
        output_language: outputLanguage,
        intensity,
      } = parsed.data;

      // 4. Sanitize text
      const text = sanitizeInput(rawText);
      if (text.trim().length === 0) {
        throw createApiError("EMPTY_TEXT", "Text is empty after sanitization", 400);
      }

      const idempotencyKey = normalizeIdempotencyKey(
        req.headers.get("X-Idempotency-Key"),
      );
      if (idempotencyKey) {
        const priorResponse = await getIdempotentResponse<{
          jobId: string;
          messageId: string;
          status: "pending" | "completed";
          result?: AIJobResult;
        }>(userId, idempotencyKey);

        if (priorResponse) {
          return NextResponse.json(priorResponse, { status: 200 });
        }
      }

      // 5. Quota check
      const supabase = getSupabaseAdmin();
      const quota = await getOrCreateUserQuota(userId, supabase);
      if (quota.usage.requests_today >= quota.limits.requests_per_day) {
        throw createApiError("QUOTA_EXCEEDED", "Daily limit reached. Upgrade for more.", 402, {
          headers: { "X-Quota-Reset": quota.resets_at }
        });
      }
      if (text.length > quota.limits.max_chars_per_request) {
        throw createApiError("TEXT_TOO_LONG", `Text exceeds your plan limit of ${quota.limits.max_chars_per_request} characters.`, 400);
      }

      // Enforce usage daily limits fallback
      try {
        await supabase.rpc('increment_wr_daily_usage', { p_user_id: userId, p_chars: text.length });
      } catch (err) {}

      // 5.5 Rate limit check
      const limit = getMaxRequestsPerMinute();
      let rateLimitHeaders: Record<string, string> = {};
      try {
        const { allowed, remaining } = await checkRateLimit(userId, limit);
        rateLimitHeaders = buildRateLimitHeaders(limit, remaining);
        addSpanAttributes({ "writeright.rate_limit_remaining": remaining });

        if (!allowed) {
          addSpanEvent("rate_limit.exceeded", { user_id: userId });
          throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429, {
            headers: { ...rateLimitHeaders, "Retry-After": "60" },
          });
        }
      } catch (err) {
        if (
          err instanceof Error &&
          (err as { code?: ErrorCode }).code === "RATE_LIMITED"
        ) {
          throw err;
        }
        console.error("[api.writeright.message] Rate limit check failed:", {
          error: err instanceof Error ? err.message : String(err),
          ...traceLogFields(),
        });
        // Graceful fallback: allow request if rate limit check itself fails
        rateLimitHeaders = buildRateLimitHeaders(limit, limit);
      }

      // 6. Verify chat belongs to user
      const { data: chat, error: chatError } = await supabase
        .from("writeright_chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (chatError || !chat) {
        throw createApiError(
          "CHAT_NOT_FOUND",
          "Chat not found or does not belong to you",
          404,
        );
      }

      // 7. Insert user message
      const { data: message, error: msgError } = await supabase
        .from("writeright_messages")
        .insert({
          chat_id: chatId,
          user_id: userId,
          role: "user",
          content: text,
          metadata: {
            tone,
            mode,
            output_language: outputLanguage,
            intensity,
            original_text: text,
          },
        })
        .select("id, created_at")
        .single();

      if (msgError || !message) {
        console.error("[api.writeright.message] Insert message failed:", {
          error: msgError?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to save message", 500);
      }

      // 8. Cache check (duplicate submission guard)
      const inputHash = computeInputHash(
        text,
        tone,
        mode,
        outputLanguage,
        intensity,
      );
      const history = await fetchChatHistory(supabase, chatId, message.id);
      try {
        const cachedResult = await getCachedAIResponse(inputHash);
        if (cachedResult) {
          addSpanEvent("cache.hit", { input_hash: inputHash });
          await supabase.from("writeright_messages").insert({
            chat_id: chatId,
            user_id: userId,
            role: "assistant",
            content: JSON.stringify(cachedResult),
            metadata: {
              tone,
              mode,
              output_language: outputLanguage,
              intensity,
              result_type: "ai_improvement",
              cached: true,
              input_hash: inputHash,
              job_id: "cached",
            },
          });

          const responseBody = {
            jobId: "cached",
            messageId: message.id,
            status: "completed" as const,
            result: cachedResult,
          };
          if (idempotencyKey) {
            await setIdempotentResponse(userId, idempotencyKey, responseBody);
          }

          // ── CHANGED: [BE-3] Include rate limit headers on cached response ──
          return NextResponse.json(
            responseBody,
            { status: 200, headers: rateLimitHeaders },
          );
        }
      } catch (err) {
        console.error("[api.writeright.message] Cache check failed:", {
          error: err instanceof Error ? err.message : String(err),
          ...traceLogFields(),
        });
      }

      // 9. Create AI job record
      const { data: job, error: jobError } = await supabase
        .from("writeright_ai_jobs")
        .insert({
          chat_id: chatId,
          user_id: userId,
          message_id: message.id,
          status: "pending",
          metadata: {
            tone,
            mode,
            output_language: outputLanguage,
            intensity,
            input_length: text.length,
            input_hash: inputHash,
          },
        })
        .select("id, created_at")
        .single();

      if (jobError || !job) {
        console.error("[api.writeright.message] Insert job failed:", {
          error: jobError?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to create AI job", 500);
      }

      addSpanAttributes({
        "writeright.chat_id": chatId,
        "writeright.job_id": job.id,
        "writeright.message_id": message.id,
        "writeright.tone": tone,
        "writeright.mode": mode,
        "writeright.output_language": outputLanguage,
        "writeright.intensity": intensity,
        "writeright.input_length": text.length,
      });

      // 10. Inject trace context for distributed tracing
      const traceHeaders = injectTraceContext(new Headers());

      // 11. Enqueue job to Redis ZSET
      const jobPayload: WritingJobPayload = {
        id: job.id,
        chatId,
        userId,
        messageId: message.id,
        content: text,
        tone,
        mode,
        output_language: outputLanguage,
        history,
        intensity,
        attempt: 0,
        traceparent: traceHeaders.traceparent,
      };

      try {
        await enqueueWriteRightJob(jobPayload);
        addSpanEvent("job.enqueued", { job_id: job.id });
      } catch (err) {
        console.error("[api.writeright.message] Redis enqueue failed:", {
          error: err instanceof Error ? err.message : String(err),
          job_id: job.id,
          ...traceLogFields(),
        });

        await supabase
          .from("writeright_ai_jobs")
          .update({ status: "failed", error: "Failed to enqueue to Redis" })
          .eq("id", job.id);

        throw createApiError(
          "QUEUE_ERROR",
          "Failed to enqueue job. Please try again.",
          503,
        );
      }

      const responseBody = {
        jobId: job.id,
        messageId: message.id,
        status: "pending" as const,
      };
      if (idempotencyKey) {
        await setIdempotentResponse(userId, idempotencyKey, responseBody);
      }

      // 12. Return jobId and messageId
      // ── CHANGED: [BE-3] Include rate limit headers ──
      return NextResponse.json(
        responseBody,
        { status: 202, headers: rateLimitHeaders },
      );
    });
  });
}

// END FILE: app/api/writeright/message/route.ts
