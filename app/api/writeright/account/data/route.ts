// app/api/writeright/account/data/route.ts — GDPR data erasure
//
// DELETE — Hard-erases all WriteRight PII for the authenticated user.
//          Requires X-Confirm-Erasure: true header to prevent accidental deletion.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { logError } from "@/lib/writeright-logger";

// ---------------------------------------------------------------------------
// DELETE /api/writeright/account/data — GDPR erasure
// ---------------------------------------------------------------------------

export async function DELETE(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.account.data.delete", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      // GDPR safety gate — caller must send this header explicitly
      const confirmation = req.headers.get("X-Confirm-Erasure");
      if (confirmation !== "true") {
        throw createApiError(
          "VALIDATION_ERROR",
          "Missing X-Confirm-Erasure: true header",
          400,
        );
      }

      const supabase = getSupabaseAdmin();

      // Call the pg function defined in migration 0016
      const { error } = await supabase.rpc("fn_erase_writeright_user_data", {
        p_user_id: userId,
      });

      if (error) {
        logError("gdpr.erase_failed", error, {
          user_id: userId,
          ...traceLogFields(),
        });
        throw createApiError(
          "DB_ERROR",
          "Failed to erase user data. Please contact support.",
          500,
        );
      }

      addSpanEvent("gdpr.erase_completed", { user_id: userId });
      console.error("[api.writeright.account.data] GDPR erasure completed", {
        user_id: userId,
        ...traceLogFields(),
      });

      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          await redis.del(
            ns("writeright", "ratelimit", userId),
            ns("writeright", "stats", userId),
            ns("writeright", "profile", userId),
            ns("writeright", "quota", userId),
          );
        } catch (err) {
          console.error("[api.writeright.account.data] Redis delete failed", {
            error: err instanceof Error ? err.message : String(err),
            ...traceLogFields(),
          });
        }
      }

      return NextResponse.json(
        {
          ok: true,
          message: "All WriteRight data has been permanently erased.",
        },
        { status: 200 },
      );
    });
  });
}
