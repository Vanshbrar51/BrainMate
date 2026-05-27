// FILE: app/api/writeright/session-stats/route.ts
// GET — Returns quick session stats for the current writing session

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes } from "@/lib/tracing";

const CACHE_TTL = 300; // 5 minutes

export async function GET(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.session-stats.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      // Check Redis cache first
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const cached = await redis.get(ns("writeright", "session-stats", userId));
          if (cached) {
            return NextResponse.json(JSON.parse(cached));
          }
        } catch {
          // Circuit fallback — continue to Supabase
        }
      }

      const supabase = getSupabaseAdmin();
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Query today's session
      const { data: todaySession } = await supabase
        .from("writeright_writing_sessions")
        .select("improvements, avg_clarity, modes_used")
        .eq("clerk_user_id", userId)
        .eq("session_date", today)
        .maybeSingle();

      // Query this week's sessions
      const { data: weekSessions } = await supabase
        .from("writeright_writing_sessions")
        .select("improvements, session_date")
        .eq("clerk_user_id", userId)
        .gte("session_date", weekAgo)
        .lte("session_date", today);

      // Query streak from profile
      const { data: profile } = await supabase
        .from("writeright_user_profile")
        .select("streak_days")
        .eq("clerk_user_id", userId)
        .maybeSingle();

      const weekCount = weekSessions?.reduce((sum, s) => sum + (s.improvements ?? 0), 0) ?? 0;
      const todayCount = todaySession?.improvements ?? 0;
      const avgClarityToday = typeof todaySession?.avg_clarity === 'number' ? Math.round(todaySession.avg_clarity * 10) / 10 : 0;
      const streakDays = profile?.streak_days ?? 0;

      // Determine top mode today
      let topModeToday: string | null = null;
      const modesUsed = todaySession?.modes_used ?? [];
      if (modesUsed.length > 0) {
        const modeCounts: Record<string, number> = {};
        for (const m of modesUsed) {
          modeCounts[m] = (modeCounts[m] ?? 0) + 1;
        }
        topModeToday = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }

      const result = {
        todayCount,
        weekCount,
        avgClarityToday,
        streakDays,
        topModeToday,
      };

      // Cache in Redis
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          await redis.setex(ns("writeright", "session-stats", userId), CACHE_TTL, JSON.stringify(result));
        } catch {
          // Non-fatal
        }
      }

      return NextResponse.json(result);
    })
  );
}
