import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function anonymousName(rank: number): string {
  return `Writer #${rank}`;
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.challenges.leaderboard.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const { data: challenge } = await supabase
        .from("writeright_daily_challenges")
        .select("id")
        .eq("date", todayKey())
        .maybeSingle();
      if (!challenge) return NextResponse.json({ entries: [] });

      const { data, error } = await supabase
        .from("writeright_challenge_completions")
        .select("user_id, score, completed_at")
        .eq("challenge_id", challenge.id)
        .order("score", { ascending: false })
        .order("completed_at", { ascending: true })
        .limit(100);
      if (error) throw createApiError("DB_ERROR", "Failed to load leaderboard", 500);

      const all = data ?? [];
      const entries = all.slice(0, 10).map((row, index) => ({
        rank: index + 1,
        display_name: row.user_id === userId ? "You" : anonymousName(index + 1),
        score: row.score,
        improved_at: row.completed_at,
      }));
      const userIndex = all.findIndex((row) => row.user_id === userId);

      return NextResponse.json({
        entries,
        user_entry: userIndex >= 0 ? { rank: userIndex + 1, score: all[userIndex].score } : undefined,
      });
    });
  });
}
