// FILE: app/api/writeright/health/route.ts — Health check endpoint
// ── CHANGED: [BE-5] Full health endpoint with latency tracking ──

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  let redisOk = false;
  let supabaseOk = false;
  let redisLatency = -1;
  let supabaseLatency = -1;

  // ── CHANGED: [BE-5] Redis health check with latency ──
  try {
    if (!isCircuitOpen()) {
      const start = performance.now();
      const pingPromise = getRedisPool().ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis ping timeout")), 500),
      );
      await Promise.race([pingPromise, timeoutPromise]);
      redisLatency = Math.round(performance.now() - start);
      redisOk = true;
    }
  } catch (error) {
    console.error("[api.writeright.health] Redis health check failed:", error);
  }

  // ── CHANGED: [BE-5] Supabase health check with latency ──
  try {
    const start = performance.now();
    const supabase = getSupabaseAdmin();

    const queryPromise = supabase
      .from("writeright_chats")
      .select("id")
      .limit(1);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase query timeout")), 1000),
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);
    supabaseLatency = Math.round(performance.now() - start);

    // result is the Supabase response
    if (result && typeof result === "object" && "error" in result) {
      const sbResult = result as { error: unknown };
      if (!sbResult.error) {
        supabaseOk = true;
      } else {
        console.error(
          "[api.writeright.health] Supabase health check failed:",
          sbResult.error,
        );
      }
    }
  } catch (error) {
    console.error("[api.writeright.health] Supabase health check failed:", error);
  }

  // ── CHANGED: [BE-5] Structured response with latency ──
  let status: "ok" | "degraded" | "down" = "ok";
  if (!redisOk && !supabaseOk) {
    status = "down";
  } else if (!redisOk || !supabaseOk) {
    status = "degraded";
  }

  return NextResponse.json(
    {
      status,
      checks: {
        redis: redisOk,
        supabase: supabaseOk,
      },
      latency: {
        redis: redisLatency,
        supabase: supabaseLatency,
      },
      ts: new Date().toISOString(),
    },
    {
      status: status === "down" ? 503 : status === "degraded" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

// END FILE: app/api/writeright/health/route.ts
