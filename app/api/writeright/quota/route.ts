import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

interface QuotaResponse {
  tier: "free" | "pro" | "team";
  limits: {
    requests_per_day: number;
    max_chars_per_request: number;
    history_days: number;
    export_formats: string[];
    templates_max: number;
    can_share: boolean;
    can_use_voice: boolean;
    languages_allowed: string[];
  };
  usage: {
    requests_today: number;
    chars_today: number;
    requests_this_month: number;
    tokens_this_month: number;
  };
  resets_at: string;
}

const TIER_LIMITS = {
  free: {
    requests_per_day: 15,
    max_chars_per_request: 3000,
    history_days: 14,
    export_formats: ["txt"],
    templates_max: 5,
    can_share: false,
    can_use_voice: true,
    languages_allowed: ["en"],
  },
  pro: {
    requests_per_day: 300,
    max_chars_per_request: 10000,
    history_days: 180,
    export_formats: ["txt", "json", "markdown"],
    templates_max: 50,
    can_share: true,
    can_use_voice: true,
    languages_allowed: ["*"], // all
  },
  team: {
    requests_per_day: 2000,
    max_chars_per_request: 20000,
    history_days: 730,
    export_formats: ["txt", "json", "markdown"],
    templates_max: -1,
    can_share: true,
    can_use_voice: true,
    languages_allowed: ["*"], // all
  },
};

function quotaCacheKey(userId: string): string {
  return ns("writeright", "quota", userId);
}

export async function getOrCreateUserQuota(userId: string, supabase: any): Promise<QuotaResponse> {
  const [settingsRes, dailyUsageRes] = await Promise.all([
    supabase.from("writeright_user_settings").select("tier").eq("user_id", userId).maybeSingle(),
    supabase.from("writeright_daily_usage").select("request_count, char_count").eq("user_id", userId).eq("usage_date", new Date().toISOString().split("T")[0]).maybeSingle(),
  ]);

  let tier: "free" | "pro" | "team" = "free";
  if (settingsRes.data && settingsRes.data.tier) {
    tier = settingsRes.data.tier as "free" | "pro" | "team";
  } else {
    await supabase.from("writeright_user_settings").insert({ user_id: userId, tier: "free" }).select().maybeSingle();
  }

  const limits = TIER_LIMITS[tier];

  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const resetsAt = nextMidnight.toISOString();

  const usage = {
    requests_today: dailyUsageRes.data?.request_count || 0,
    chars_today: dailyUsageRes.data?.char_count || 0,
    requests_this_month: 0, // Should be implemented properly with aggregated usage if needed
    tokens_this_month: 0,
  };

  return { tier, limits, usage, resets_at: resetsAt };
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.quota.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const cached = await redis.get(quotaCacheKey(userId));
          if (cached) {
            return NextResponse.json(JSON.parse(cached) as QuotaResponse);
          }
        } catch (err) {
          console.error("[api.writeright.quota] Cache read failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      const supabase = getSupabaseAdmin();
      const quota = await getOrCreateUserQuota(userId, supabase);

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          await redis.setex(quotaCacheKey(userId), 60, JSON.stringify(quota));
        } catch (err) {
          console.error("[api.writeright.quota] Cache write failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      return NextResponse.json(quota);
    });
  });
}
