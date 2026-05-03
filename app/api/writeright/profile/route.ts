import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";

function profileCacheKey(userId: string): string {
  return ns("writeright", "profile", userId);
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.profile.get", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      const response: { top_mistakes: string[], improvement_count: number } = { top_mistakes: [], improvement_count: 0 };

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const cached = await redis.get(profileCacheKey(userId));
          if (cached) {
            return NextResponse.json(JSON.parse(cached));
          }
        } catch (err) {
          console.error("[api.writeright.profile] Cache read failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      const supabase = getSupabaseAdmin();
      
      const { data, error } = await supabase
        .from("writeright_writing_profiles")
        .select("top_mistakes, improvement_count")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
        
      if (error) {
        throw createApiError("DB_ERROR", "Failed to fetch writing profile", 500, { error });
      }

      if (data) {
        response.top_mistakes = Array.isArray(data.top_mistakes) ? data.top_mistakes : [];
        response.improvement_count = typeof data.improvement_count === 'number' ? data.improvement_count : 0;
      }

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          await redis.setex(profileCacheKey(userId), 300, JSON.stringify(response));
        } catch (err) {
          console.error("[api.writeright.profile] Cache write failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      return NextResponse.json(response);
    });
  });
}
