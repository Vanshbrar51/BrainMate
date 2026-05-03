// app/api/writeright/quota/route.ts — Usage quota enforcement
//
// GET — Returns the calling user's tier, current period usage, and remaining quota.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Tier = "free" | "pro" | "team";

const TIER_LIMITS: Record<Tier, { requests: number; tokens: number }> = {
  free:  { requests: 50,    tokens: 200_000  },
  pro:   { requests: 500,   tokens: 2_000_000 },
  team:  { requests: 2_000, tokens: 10_000_000 },
};

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// GET /api/writeright/quota
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.quota.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const period = currentPeriodKey();

      // Fetch tier and quota in parallel
      const [
        { data: settingsRow },
        { data: quotaRow },
      ] = await Promise.all([
        supabase
          .from("writeright_user_settings")
          .select("tier")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("writeright_quota")
          .select("requests, tokens")
          .eq("user_id", userId)
          .eq("period_key", period)
          .maybeSingle(),
      ]);

      const tier = ((settingsRow?.tier as Tier | undefined) ?? "free") as Tier;
      const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
      const usedRequests = quotaRow?.requests ?? 0;
      const usedTokens = quotaRow?.tokens ?? 0;

      addSpanAttributes({
        "writeright.quota.tier": tier,
        "writeright.quota.requests_used": usedRequests,
        "writeright.quota.tokens_used": usedTokens,
      });

      return NextResponse.json({
        tier,
        period,
        limits,
        used: {
          requests: usedRequests,
          tokens: usedTokens,
        },
        remaining: {
          requests: Math.max(0, limits.requests - usedRequests),
          tokens: Math.max(0, limits.tokens - usedTokens),
        },
        exhausted: {
          requests: usedRequests >= limits.requests,
          tokens: usedTokens >= limits.tokens,
        },
      });
    });
  });
}
