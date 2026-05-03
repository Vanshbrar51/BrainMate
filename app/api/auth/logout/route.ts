import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { forceRevokeSession } from "@/lib/rust-auth";
import {
  bumpSessionVersion,
  enqueueReconciliation,
} from "@/lib/reconciliation-worker";
import {
  withSpan,
  addSpanAttributes,
  injectTraceContext,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler } from "@/lib/writeright-errors";

const GATEWAY_PUBLIC = process.env.RUST_AUTH_API_URL ?? "http://127.0.0.1:8081";

type SessionClaims = {
  jti?: string;
  exp?: number;
};

function isRetryableFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * POST /api/auth/logout
 *
 * Revokes the current session in the Rust auth gateway and blacklists
 * the current JWT. Two-stage approach with reconciliation fallback:
 *
 * 1. Try public gateway (validates JWT, then revokes) — preferred path
 * 2. If public fails, fall back to internal gateway force-revoke
 * 3. If internal also fails, enqueue to reconciliation worker for async retry
 */
export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.auth.logout", async () => {
      const { sessionId, getToken, sessionClaims } = await auth();

      if (!sessionId) {
        return NextResponse.json({ ok: true }); // already logged out
      }

      addSpanAttributes({ "session.id": sessionId });
      const sessionVersion = await bumpSessionVersion(sessionId);

      const token = await getToken();
      if (!token) {
        // Can't get a token but have a session — force-revoke via internal gateway
        const result = await forceRevokeSession(sessionId);
        if (!result.ok) {
          console.error("[auth/logout] force revoke failed:", {
            reason: result.reason,
            ...traceLogFields(),
          });
          // Enqueue for async retry
          await enqueueReconciliation({
            type: "session_revoke",
            sessionId,
            targetVersion: sessionVersion,
          });
        }
        return NextResponse.json({ ok: true });
      }

      const claims = (sessionClaims as SessionClaims | null) ?? null;
      const jti = claims?.jti ?? null;
      const exp = claims?.exp ?? null;

      // Stage 1: Try public gateway logout
      const nonce = crypto.randomUUID();
      let publicSucceeded = false;

      try {
        const res = await fetch(`${GATEWAY_PUBLIC}/v1/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-request-nonce": nonce,
            ...injectTraceContext(new Headers()),
          },
          signal: AbortSignal.timeout(5000),
        });

        publicSucceeded = res.ok || res.status === 204;

        if (!publicSucceeded) {
          console.warn(
            `[auth/logout] public gateway returned ${res.status}, falling back to internal`,
            traceLogFields(),
          );
        }
      } catch (err) {
        console.warn(
          "[auth/logout] public gateway unreachable, falling back to internal:",
          err instanceof Error ? err.message : err,
          traceLogFields(),
        );
      }

      // Stage 2: If public failed, force-revoke via internal gateway
      if (!publicSucceeded) {
        const result = await forceRevokeSession(sessionId, jti, exp);
        if (!result.ok && isRetryableFailure(result.status)) {
          console.error(
            "[auth/logout] internal force-revoke also failed:",
            { reason: result.reason, ...traceLogFields() },
          );
          // Stage 3: Enqueue to reconciliation worker for async retry
          await enqueueReconciliation({
            type: "session_revoke",
            sessionId,
            jti: jti ?? undefined,
            tokenExp: exp ?? undefined,
            targetVersion: sessionVersion,
          });
        } else if (!result.ok) {
          console.warn(
            "[auth/logout] internal force-revoke failed with non-retryable status:",
            { reason: result.reason, ...traceLogFields() },
          );
        }
      }

      return NextResponse.json({ ok: true });
    });
  });
}
