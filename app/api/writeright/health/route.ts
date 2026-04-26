// FILE: app/api/writeright/health/route.ts — Health check endpoint

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool } from "@/lib/redis";

export async function GET() {
  let redisOk = false;
  let supabaseOk = false;

  // Check Redis
  try {
    const pingPromise = getRedisPool().ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 500)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    redisOk = true;
  } catch (error) {
    console.error("[api.writeright.health] Redis health check failed:", error);
  }

  // Check Supabase
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("writeright_chats").select("id").limit(1);
    if (!error) {
      supabaseOk = true;
    } else {
      console.error("[api.writeright.health] Supabase health check failed:", error);
    }
  } catch (error) {
    console.error("[api.writeright.health] Supabase health check failed:", error);
  }

  let status = "ok";
  if (!redisOk && !supabaseOk) {
    status = "down";
  } else if (!redisOk || !supabaseOk) {
    status = "degraded";
  }

  return NextResponse.json(
    {
      status,
      redis: redisOk,
      supabase: supabaseOk,
      timestamp: new Date().toISOString(),
    },
    { status: status === "down" ? 503 : 200 }
  );
}

// END FILE: app/api/writeright/health/route.ts
