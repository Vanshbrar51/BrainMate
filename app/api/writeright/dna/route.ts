import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

type Trend = "improving" | "declining" | "steady";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function scoresFromOutput(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;
  const scores = (output as { scores?: unknown }).scores;
  if (!scores || typeof scores !== "object") return null;
  const clarity = (scores as { clarity?: unknown }).clarity;
  return typeof clarity === "number" ? clarity : null;
}

function trendFor(values: number[]): Trend {
  if (values.length < 4) return "steady";
  const mid = Math.floor(values.length / 2);
  const avg = (rows: number[]) => rows.reduce((a, b) => a + b, 0) / Math.max(rows.length, 1);
  const delta = avg(values.slice(mid)) - avg(values.slice(0, mid));
  return delta > 0.5 ? "improving" : delta < -0.5 ? "declining" : "steady";
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.dna.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const cacheKey = ns("writeright", "dna", userId);
      if (!isCircuitOpen()) {
        const cached = await getRedisPool().get(cacheKey).catch(() => null);
        if (cached) return NextResponse.json(JSON.parse(cached) as Record<string, unknown>);
      }

      const supabase = getSupabaseAdmin();
      const [{ data: profile }, { data: jobs }] = await Promise.all([
        supabase
          .from("writeright_writing_profiles")
          .select("top_mistakes, improvement_count")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("writeright_ai_jobs")
          .select("metadata, output, created_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);

      const completed = jobs ?? [];
      const improvementCount = Math.max(profile?.improvement_count ?? 0, completed.length);
      if (improvementCount < 10) {
        const response = {
          overused_phrases: [],
          avoided_tones: [],
          preferred_mode: "email",
          clarity_trend: "steady" as Trend,
          top_mistakes: [],
          strength: "Your Writing DNA unlocks after a few more improvements.",
          growth_area: "Complete more improvements to reveal personalized coaching.",
          ready_at: 10 - improvementCount,
        };
        return NextResponse.json(response);
      }

      const modeCounts = new Map<string, number>();
      const toneCounts = new Map<string, number>();
      const clarityScores: number[] = [];
      for (const job of completed) {
        const metadata = (job.metadata ?? {}) as Record<string, unknown>;
        const mode = typeof metadata.mode === "string" ? metadata.mode : "";
        const tone = typeof metadata.tone === "string" ? metadata.tone : "";
        if (mode) modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
        if (tone) toneCounts.set(tone, (toneCounts.get(tone) ?? 0) + 1);
        const clarity = scoresFromOutput(job.output);
        if (clarity !== null) clarityScores.push(clarity);
      }

      const tones = ["Professional", "Friendly", "Concise", "Academic", "Assertive"];
      const topMistakes = asStringArray(profile?.top_mistakes)
        .slice(0, 5)
        .map((mistake) => ({ mistake, count: 1, last_seen: new Date().toISOString() }));
      const preferredMode = Array.from(modeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "email";
      const avoidedTones = tones.filter((tone) => !toneCounts.has(tone)).slice(0, 2);

      const response = {
        overused_phrases: topMistakes.map((row) => row.mistake).slice(0, 3),
        avoided_tones: avoidedTones,
        preferred_mode: preferredMode,
        clarity_trend: trendFor(clarityScores),
        top_mistakes: topMistakes,
        strength: "Friendly and clear — your messages are easy to respond to.",
        growth_area: avoidedTones.includes("Assertive")
          ? "Try assertive tone for requests where the next step matters."
          : "Keep tightening long sentences before you submit.",
        ready_at: 0,
      };

      if (!isCircuitOpen()) {
        await getRedisPool().setex(cacheKey, 86_400, JSON.stringify(response)).catch(() => undefined);
      }

      return NextResponse.json(response);
    });
  });
}
