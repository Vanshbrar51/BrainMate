// FILE: app/api/writeright/stats/route.ts — WriteRight usage statistics

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

// Token cost per token (approximate at time of writing)
const COST_PER_TOKEN_FLASH = 0.0000015; // Gemini Flash
const COST_PER_TOKEN_PRO   = 0.000015;  // Gemini Pro

type TokenUsageRow = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
  created_at: string;
};

type StatsResponse = {
  streak: {
    current: number;
    longest: number;
    last_activity_date: string | null;
  };
  total: number;
  mode_breakdown: Array<{ mode: string; count: number; percent: number }>;
  tone_breakdown: Array<{ tone: string; count: number; percent: number }>;
  weekly_counts: number[];
  achievements: string[];
  avg_clarity_by_day: number[];
  // BUG-06 FIX: token_usage now actually populated from writeright_usage
  token_usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    by_model: Array<{ model: string; tokens: number }>;
    estimated_cost_usd: number;
  };
};

function statsCacheKey(userId: string): string {
  return ns("writeright", "stats", userId);
}

function estimateCost(rows: TokenUsageRow[]): number {
  return rows.reduce((acc, row) => {
    const isProModel = row.model.toLowerCase().includes("pro");
    const costPerToken = isProModel ? COST_PER_TOKEN_PRO : COST_PER_TOKEN_FLASH;
    return acc + (row.total_tokens ?? 0) * costPerToken;
  }, 0);
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.stats.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const cached = await redis.get(statsCacheKey(userId));
          if (cached) {
            return NextResponse.json(JSON.parse(cached) as StatsResponse);
          }
        } catch (err) {
          console.error("[api.writeright.stats] Cache read failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      const supabase = getSupabaseAdmin();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        { data: streakRow },
        { count: usageCount },
        { data: jobs },
        { data: weekUsage },
        { data: achievementsRows },
        { data: clarityJobs },
        // BUG-06 FIX: query writeright_usage for token data (was never queried before)
        { data: tokenUsageRows, error: tokenUsageError },
      ] = await Promise.all([
        supabase
          .from("writeright_streaks")
          .select("current_streak, longest_streak, last_activity_date")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("writeright_usage")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", userId),
        supabase
          .from("writeright_ai_jobs")
          .select("metadata, created_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .limit(1000),
        supabase
          .from("writeright_usage")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from("writeright_achievements")
          .select("achievement")
          .eq("user_id", userId)
          .order("earned_at", { ascending: false }),
        supabase
          .from("writeright_ai_jobs")
          .select("output, created_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("created_at", new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString())
          .not("output", "is", null)
          .limit(200),
        supabase
          .from("writeright_usage")
          .select("prompt_tokens, completion_tokens, total_tokens, model, created_at")
          .eq("user_id", userId)
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false }),
      ]);

      if (tokenUsageError) {
        console.error("[api.writeright.stats] Token usage query failed", {
          error: tokenUsageError.message,
          ...traceLogFields(),
        });
      }

      const modeCounter = new Map<string, number>();
      const toneCounter = new Map<string, number>();
      const completedJobs = jobs ?? [];

      for (const row of completedJobs) {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const mode = typeof metadata.mode === "string" ? metadata.mode : "";
        const tone = typeof metadata.tone === "string" ? metadata.tone : "";
        if (mode) modeCounter.set(mode, (modeCounter.get(mode) ?? 0) + 1);
        if (tone) toneCounter.set(tone, (toneCounter.get(tone) ?? 0) + 1);
      }

      const totalCompleted = completedJobs.length || 1;
      const mode_breakdown = Array.from(modeCounter.entries())
        .map(([mode, count]) => ({ mode, count, percent: Math.round((count / totalCompleted) * 100) }))
        .sort((a, b) => b.count - a.count);
      const tone_breakdown = Array.from(toneCounter.entries())
        .map(([tone, count]) => ({ tone, count, percent: Math.round((count / totalCompleted) * 100) }))
        .sort((a, b) => b.count - a.count);

      const weeklyBuckets = new Array<number>(7).fill(0);
      const weekRows = weekUsage ?? [];
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);
      for (const row of weekRows) {
        if (!row.created_at) continue;
        const created = new Date(row.created_at);
        const dayDiff = Math.floor((baseDate.getTime() - new Date(created.setHours(0, 0, 0, 0)).getTime()) / 86400000);
        if (dayDiff >= 0 && dayDiff < 7) {
          weeklyBuckets[6 - dayDiff] += 1;
        }
      }

      // Build token usage summary
      const safeTokenRows = (tokenUsageRows ?? []) as TokenUsageRow[];
      const totalTokens = safeTokenRows.reduce((acc, r) => acc + (r.total_tokens ?? 0), 0);
      const totalPromptTokens = safeTokenRows.reduce((acc, r) => acc + (r.prompt_tokens ?? 0), 0);
      const totalCompletionTokens = safeTokenRows.reduce((acc, r) => acc + (r.completion_tokens ?? 0), 0);

      const modelTokenMap = new Map<string, number>();
      for (const r of safeTokenRows) {
        if (r.model) {
          modelTokenMap.set(r.model, (modelTokenMap.get(r.model) ?? 0) + (r.total_tokens ?? 0));
        }
      }
      const by_model = Array.from(modelTokenMap.entries())
        .map(([model, tokens]) => ({ model, tokens }))
        .sort((a, b) => b.tokens - a.tokens);

      const response: StatsResponse = {
        streak: {
          current: streakRow?.current_streak ?? 0,
          longest: streakRow?.longest_streak ?? 0,
          last_activity_date: streakRow?.last_activity_date ?? null,
        },
        total: usageCount ?? 0,
        mode_breakdown,
        tone_breakdown,
        weekly_counts: weeklyBuckets,
        achievements: (achievementsRows ?? [])
          .map((row) => row.achievement)
          .filter((achievement): achievement is string => typeof achievement === "string"),
        avg_clarity_by_day: (() => {
          const buckets: number[][] = Array.from({ length: 7 }, () => []);
          const refDate = new Date();
          refDate.setHours(0, 0, 0, 0);
          for (const row of (clarityJobs ?? [])) {
            if (!row.created_at || !row.output) continue;
            const output = row.output as Record<string, unknown>;
            const scores = output.scores as Record<string, unknown> | undefined;
            if (!scores || typeof scores.clarity !== "number") continue;
            const created = new Date(row.created_at);
            const dayDiff = Math.floor((refDate.getTime() - new Date(created.setHours(0, 0, 0, 0)).getTime()) / 86400000);
            if (dayDiff >= 0 && dayDiff < 7) {
              buckets[6 - dayDiff].push(scores.clarity as number);
            }
          }
          return buckets.map(arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
        })(),
        token_usage: {
          total_tokens: totalTokens,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          by_model,
          estimated_cost_usd: Math.round(estimateCost(safeTokenRows) * 1_000_000) / 1_000_000,
        },
      };

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          await redis.setex(statsCacheKey(userId), 300, JSON.stringify(response));
        } catch (err) {
          console.error("[api.writeright.stats] Cache write failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      return NextResponse.json(response);
    });
  });
}
