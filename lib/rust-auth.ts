// lib/rust-auth.ts — Enterprise-grade auth gateway client with retry logic + tracing

import { withClientSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";
import { invalidateSecret } from "@/lib/secrets";
import { getInternalApiTokenCandidates } from "@/lib/internal-api-token";

export type GatewaySessionResponse = {
  user_id: string;
  session_id: string;
  issued_at: number | null;
  expires_at: number;
  issuer: string;
};

export type GatewayResult =
  | { ok: true; data: GatewaySessionResponse }
  | { ok: false; status: number; reason: string };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GATEWAY_PUBLIC = () =>
  process.env.RUST_AUTH_API_URL ?? "http://127.0.0.1:8081";

const GATEWAY_INTERNAL = () =>
  process.env.AUTH_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:9091";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff with full jitter + tracing
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      // Inject W3C trace context into every outgoing request
      const traceHeaders = injectTraceContext(new Headers());
      const headers = new Headers(init.headers);
      for (const [key, value] of Object.entries(traceHeaders)) {
        headers.set(key, value);
      }

      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      // Don't retry on client errors (4xx) — only on server/network errors
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // 5xx — retry
      lastError = new Error(`Gateway returned ${res.status}`);
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Gateway unreachable");
    } finally {
      clearTimeout(timeout);
    }

    // Exponential backoff with full jitter
    if (attempt < retries) {
      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt),
        5000
      );
      const jitter = Math.random() * delay;
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError ?? new Error("Gateway unreachable after retries");
}

// ---------------------------------------------------------------------------
// Public: Validate a Clerk JWT against the gateway
// ---------------------------------------------------------------------------

/**
 * Validates a Clerk JWT against the Rust auth gateway.
 * Calls GET /v1/auth/session — requires the session to already exist in Redis.
 * Retries up to 3 times with exponential backoff on transient failures.
 */
export async function validateToken(
  token: string
): Promise<GatewayResult> {
  return withClientSpan("gateway.validate-token", async () => {
    const baseUrl = GATEWAY_PUBLIC();
    if (!baseUrl) {
      return { ok: false as const, status: 500, reason: "RUST_AUTH_API_URL is not configured" };
    }

    addSpanAttributes({
      "gateway.operation": "validate_token",
      "gateway.url": `${baseUrl}/v1/auth/session`,
    });

    try {
      const res = await fetchWithRetry(`${baseUrl}/v1/auth/session`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      addSpanAttributes({ "http.status_code": res.status });

      if (!res.ok) {
        return {
          ok: false as const,
          status: res.status,
          reason: `Gateway rejected token: ${res.status}`,
        };
      }

      const data = (await res.json()) as GatewaySessionResponse;
      return { ok: true as const, data };
    } catch (err) {
      return {
        ok: false as const,
        status: 503,
        reason: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }, {
    "rpc.system": "http",
    "rpc.service": "auth-gateway",
    "rpc.method": "validateToken",
  });
}

// ---------------------------------------------------------------------------
// Internal: Sync a Clerk session to the Rust gateway (server-to-server)
// ---------------------------------------------------------------------------

export type SyncSessionParams = {
  sessionId: string;
  userId: string;
  issuedAt?: number;
  expiresAt: number;
  deviceInfo?: string;
};

/**
 * Creates a session in the Rust gateway's Redis store.
 * Should be called after successful Clerk authentication so that
 * subsequent validateToken() calls succeed.
 *
 * Uses the INTERNAL gateway port and API token (server-to-server only).
 */
export async function syncSession(
  params: SyncSessionParams
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  return withClientSpan("gateway.sync-session", async () => {
    const baseUrl = GATEWAY_INTERNAL();
    const tokenCandidates = await getInternalApiTokenCandidates();

    if (!baseUrl || tokenCandidates.length === 0) {
      console.error("[rust-auth] AUTH_GATEWAY_INTERNAL_URL or INTERNAL_API_TOKEN not configured");
      return { ok: false as const, status: 500, reason: "Internal gateway not configured" };
    }

    addSpanAttributes({
      "gateway.operation": "sync_session",
      "session.id": params.sessionId,
      "session.user_id": params.userId,
    });

    try {
      for (const token of tokenCandidates) {
        const res = await fetchWithRetry(`${baseUrl}/v1/auth/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-api-token": token,
          },
          body: JSON.stringify({
            sid: params.sessionId,
            user_id: params.userId,
            issued_at: params.issuedAt ?? Math.floor(Date.now() / 1000),
            device_info: params.deviceInfo ?? null,
            expires_at: params.expiresAt,
          }),
        });

        addSpanAttributes({ "http.status_code": res.status });

        if (res.ok) {
          return { ok: true as const };
        }

        const text = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          continue;
        }

        return {
          ok: false as const,
          status: res.status,
          reason: `Session sync failed: ${res.status} ${text}`,
        };
      }

      invalidateSecret("INTERNAL_API_TOKEN");
      return {
        ok: false as const,
        status: 401,
        reason: "Session sync failed: 401 Invalid internal API token",
      };
    } catch (err) {
      return {
        ok: false as const,
        status: 503,
        reason: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }, {
    "rpc.system": "http",
    "rpc.service": "auth-gateway",
    "rpc.method": "syncSession",
  });
}

// ---------------------------------------------------------------------------
// Internal: Force-revoke a session via internal gateway (for logout fallback)
// ---------------------------------------------------------------------------

/**
 * Force-revokes a session and optionally blacklists a token via the
 * internal gateway. Used as a fallback when the public logout endpoint
 * fails (e.g., token already expired).
 */
export async function forceRevokeSession(
  sessionId: string,
  jti?: string | null,
  tokenExp?: number | null
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  return withClientSpan("gateway.force-revoke-session", async () => {
    const baseUrl = GATEWAY_INTERNAL();
    const tokenCandidates = await getInternalApiTokenCandidates();

    if (!baseUrl || tokenCandidates.length === 0) {
      return { ok: false as const, status: 500, reason: "Internal gateway not configured" };
    }

    addSpanAttributes({
      "gateway.operation": "force_revoke_session",
      "session.id": sessionId,
    });

    try {
      const params = new URLSearchParams();
      if (jti) params.set("jti", jti);
      if (tokenExp) params.set("token_exp", tokenExp.toString());

      const qs = params.toString();
      const url = `${baseUrl}/v1/auth/session/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ""}`;

      for (const token of tokenCandidates) {
        const res = await fetchWithRetry(url, {
          method: "DELETE",
          headers: {
            "x-internal-api-token": token,
          },
        });

        addSpanAttributes({ "http.status_code": res.status });

        if (res.ok || res.status === 404) {
          return { ok: true as const };
        }

        if (res.status === 401 || res.status === 403) {
          continue;
        }

        return {
          ok: false as const,
          status: res.status,
          reason: `Force revoke failed: ${res.status}`,
        };
      }

      invalidateSecret("INTERNAL_API_TOKEN");
      return {
        ok: false as const,
        status: 401,
        reason: "Force revoke failed: 401 Invalid internal API token",
      };
    } catch (err) {
      return {
        ok: false as const,
        status: 503,
        reason: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }, {
    "rpc.system": "http",
    "rpc.service": "auth-gateway",
    "rpc.method": "forceRevokeSession",
  });
}
