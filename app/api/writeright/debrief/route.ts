import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

function weekStart(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function nextMondayTtl(): number {
  const next = weekStart(new Date());
  next.setDate(next.getDate() + 7);
  return Math.max(60, Math.floor((next.getTime() - Date.now()) / 1000));
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.debrief.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      addSpanAttributes({ "user.id": userId });

      const start = weekStart(new Date());
      const cacheKey = ns("writeright", "debrief", userId, start.toISOString().slice(0, 10));
      if (!isCircuitOpen()) {
        const cached = await getRedisPool().get(cacheKey).catch(() => null);
        if (cached) return NextResponse.json(JSON.parse(cached) as Record<string, unknown>);
      }

      const supabase = getSupabaseAdmin();
      const priorStart = new Date(start);
      priorStart.setDate(priorStart.getDate() - 7);
      const [{ data: current }, { data: prior }] = await Promise.all([
        supabase
          .from("writeright_ai_jobs")
          .select("output, metadata, created_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .is("deleted_at", null)
          .gte("created_at", start.toISOString()),
        supabase
          .from("writeright_ai_jobs")
          .select("output")
          .eq("user_id", userId)
          .eq("status", "completed")
          .is("deleted_at", null)
          .gte("created_at", priorStart.toISOString())
          .lt("created_at", start.toISOString()),
      ]);

      const score = (rows: Array<{ output: unknown }> | null) => {
        const values = (rows ?? []).map((row) => {
          const scores = row.output && typeof row.output === "object"
            ? (row.output as { scores?: unknown }).scores
            : null;
          if (!scores || typeof scores !== "object") return null;
          const s = scores as { clarity?: unknown; tone?: unknown; impact?: unknown };
          return [s.clarity, s.tone, s.impact].reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0) / 3;
        }).filter((value): value is number => value !== null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      };

      const total = current?.length ?? 0;
      const response = {
        week_start: start.toISOString().slice(0, 10),
        total_improvements: total,
        best_session: total > 0 ? `${new Date(current?.[0]?.created_at ?? Date.now()).toLocaleDateString(undefined, { weekday: "long" })} — ${total} improvements this week` : "",
        top_mistake_fixed: "You made your writing clearer and easier to act on.",
        score_improvement: Math.round((score(current ?? []) - score(prior ?? [])) * 10) / 10,
        coach_message: total >= 3
          ? "Strong week. Keep aiming for one clear ask and one crisp next step in every draft."
          : "Do three improvements this week to unlock a personalized coaching debrief.",
        ready: total >= 3,
      };

      if (!isCircuitOpen()) {
        await getRedisPool().setex(cacheKey, nextMondayTtl(), JSON.stringify(response)).catch(() => undefined);
      }

      return NextResponse.json(response);
    });
  });
}
