import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { syncSession } from "@/lib/rust-auth";
import {
  enqueueReconciliation,
  readSessionVersion,
} from "@/lib/reconciliation-worker";

type SessionClaims = {
  exp?: number;
};

function isRetryableSyncFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * POST /api/auth/sync
 *
 * Called after Clerk authentication to register the session in the
 * Rust auth gateway's Redis store. Includes reconciliation fallback
 * on failure for guaranteed eventual consistency.
 */
export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.auth.sync", async () => {
      const { userId, sessionId, sessionClaims } = await auth();

      if (!userId || !sessionId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({
        "session.id": sessionId,
        "session.user_id": userId,
      });

      const expiresAt = (sessionClaims as SessionClaims | null)?.exp;
      if (!expiresAt) {
        throw createApiError("VALIDATION_ERROR", "Missing session expiration claim", 400);
      }

      const expectedVersion = await readSessionVersion(sessionId);
      const result = await syncSession({ sessionId, userId, expiresAt });

      if (!result.ok) {
        console.error("[auth/sync] session sync failed:", {
          reason: result.reason,
          ...traceLogFields(),
        });

        const enqueued = isRetryableSyncFailure(result.status);
        if (enqueued) {
          // Enqueue only transient failures for async retry.
          await enqueueReconciliation({
            type: "session_sync",
            sessionId,
            userId,
            expiresAt,
            expectedVersion,
          });
        }

        return NextResponse.json(
          { error: result.reason, reconciliation: enqueued ? "enqueued" : "skipped" },
          { status: result.status }
        );
      }

      return NextResponse.json({ ok: true, sessionId });
    });
  });
}
