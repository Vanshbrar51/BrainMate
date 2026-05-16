import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const DAY_MS = 86_400_000;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextMilestone(current: number): number {
  const milestones = [3, 7, 14, 30, 60, 100, 365];
  return milestones.find((value) => value > current) ?? current + 100;
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.streak.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const today = new Date();
      const todayKey = dateKey(today);
      const yesterdayKey = dateKey(new Date(today.getTime() - DAY_MS));

      const [{ data: streak }, { data: usageRows }] = await Promise.all([
        supabase
          .from("writeright_streaks")
          .select("current_streak, longest_streak, last_activity_date")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("writeright_usage")
          .select("created_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .gte("created_at", new Date(Date.now() - 90 * DAY_MS).toISOString()),
      ]);

      const lastActivity = streak?.last_activity_date ?? null;
      const improvedToday = lastActivity === todayKey;
      const atRisk = !improvedToday && lastActivity === yesterdayKey && (streak?.current_streak ?? 0) > 0;
      const dayCounts = new Map<number, number>();
      for (const row of usageRows ?? []) {
        if (!row.created_at) continue;
        const day = new Date(row.created_at).getDay();
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const bestDay = Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? today.getDay();
      const current = streak?.current_streak ?? 0;

      return NextResponse.json({
        current,
        longest: streak?.longest_streak ?? 0,
        last_activity_date: lastActivity,
        at_risk: atRisk,
        improved_today: improvedToday,
        best_writing_day: dayNames[bestDay],
        milestone_next: Math.max(0, nextMilestone(current) - current),
      });
    });
  });
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.streak.defend", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const supabase = getSupabaseAdmin();
      await supabase
        .from("writeright_streaks")
        .update({
          metadata: { streak_at_risk_notified: true, notified_at: new Date().toISOString() },
        })
        .eq("user_id", userId);

      return NextResponse.json({ ok: true });
    });
  });
}
