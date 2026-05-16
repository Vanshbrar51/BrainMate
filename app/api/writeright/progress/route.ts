import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

type Scores = { clarity: number; tone: number; impact: number };
type DailyScores = {
  date: string;
  avg_clarity: number;
  avg_tone: number;
  avg_impact: number;
  count: number;
};

function readScores(output: unknown): Scores | null {
  if (!output || typeof output !== "object") return null;
  const scores = (output as { scores?: unknown }).scores;
  if (!scores || typeof scores !== "object") return null;
  const row = scores as { clarity?: unknown; tone?: unknown; impact?: unknown };
  if (typeof row.clarity !== "number" || typeof row.tone !== "number" || typeof row.impact !== "number") return null;
  return { clarity: row.clarity, tone: row.tone, impact: row.impact };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.progress.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 29);

      const { data, error } = await supabase
        .from("writeright_ai_jobs")
        .select("output, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("output", "is", null)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw createApiError("DB_ERROR", "Failed to load progress", 500);

      const buckets = new Map<string, Scores[]>();
      for (let i = 0; i < 30; i += 1) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + i);
        buckets.set(dayKey(date), []);
      }

      const personal = {
        clarity: 0,
        clarity_date: "",
        tone: 0,
        tone_date: "",
        impact: 0,
        impact_date: "",
      };

      for (const row of data ?? []) {
        const scores = readScores(row.output);
        if (!scores || !row.created_at) continue;
        const date = dayKey(new Date(row.created_at));
        buckets.get(date)?.push(scores);
        if (scores.clarity > personal.clarity) {
          personal.clarity = scores.clarity;
          personal.clarity_date = date;
        }
        if (scores.tone > personal.tone) {
          personal.tone = scores.tone;
          personal.tone_date = date;
        }
        if (scores.impact > personal.impact) {
          personal.impact = scores.impact;
          personal.impact_date = date;
        }
      }

      const dailyScores: DailyScores[] = Array.from(buckets.entries()).map(([date, values]) => {
        const count = values.length;
        const sum = values.reduce((acc, value) => ({
          clarity: acc.clarity + value.clarity,
          tone: acc.tone + value.tone,
          impact: acc.impact + value.impact,
        }), { clarity: 0, tone: 0, impact: 0 });
        return {
          date,
          avg_clarity: count ? Math.round((sum.clarity / count) * 10) / 10 : 0,
          avg_tone: count ? Math.round((sum.tone / count) * 10) / 10 : 0,
          avg_impact: count ? Math.round((sum.impact / count) * 10) / 10 : 0,
          count,
        };
      });

      const scoreOf = (row: DailyScores) => row.count ? (row.avg_clarity + row.avg_tone + row.avg_impact) / 3 : 0;
      const last7 = dailyScores.slice(-7).filter((row) => row.count > 0).map(scoreOf);
      const prior7 = dailyScores.slice(-14, -7).filter((row) => row.count > 0).map(scoreOf);
      const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const delta = avg(last7) - avg(prior7);
      const trend = delta > 0.5 ? "improving" : delta < -0.5 ? "declining" : "steady";

      return NextResponse.json({
        daily_scores: dailyScores,
        personal_bests: personal,
        trend,
        total_improvements: (data ?? []).length,
      });
    });
  });
}
