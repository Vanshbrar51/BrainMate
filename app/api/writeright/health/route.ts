// FILE: app/api/writeright/health/route.ts — Health check endpoint
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
  let queueDepth = 0;
  let oldestJobAgeMs = 0;
  let deadLetterCount = 0;

  try {
    if (!isCircuitOpen()) {
      const start = performance.now();
      const redis = getRedisPool();

      const pingPromise = redis.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis ping timeout")), 3000),
      );
      await Promise.race([pingPromise, timeoutPromise]);
      redisLatency = Math.round(performance.now() - start);
      redisOk = true;

      // Check queue depth
      try {
        queueDepth = await redis.zcard("writeright:jobs");
        const oldestJob = await redis.zrange("writeright:jobs", 0, 0, "WITHSCORES");
        if (oldestJob && oldestJob.length === 2) {
           const score = parseFloat(oldestJob[1]);
           if (!isNaN(score)) {
              oldestJobAgeMs = Math.max(0, Date.now() - score);
           }
        }

        deadLetterCount = await redis.zcard("writeright:jobs:dead");
      } catch(err){}
    }
  } catch (error) {
    console.error("[api.writeright.health] Redis health check failed:", error);
  }

  try {
    const start = performance.now();
    const supabase = getSupabaseAdmin();

    const queryPromise = supabase
      .from("writeright_chats")
      .select("id")
      .limit(1);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase query timeout")), 3000),
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);
    supabaseLatency = Math.round(performance.now() - start);

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

  let status: "ok" | "degraded" | "down" = "ok";
  if (!supabaseOk) {
    status = "down";
  } else if (!redisOk) {
    status = "degraded";
  }

  return NextResponse.json(
    {
      status,
      version: process.env.APP_VERSION ?? "unknown",
      checks: {
        database: supabaseOk ? "ok" : "error",
        redis: isCircuitOpen() ? "circuit_open" : (redisOk ? "ok" : "error"),
        queue_depth: queueDepth,
        oldest_job_age_ms: oldestJobAgeMs,
        dead_letter_count: deadLetterCount,
      },
      latency: {
        database_ms: supabaseLatency,
        redis_ms: redisLatency,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: status === "down" ? 503 : status === "degraded" ? 200 : 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
