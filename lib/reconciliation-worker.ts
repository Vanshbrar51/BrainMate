// lib/reconciliation-worker.ts — Background reconciliation system
//
// Durable async recovery for failed auth operations (logout, session sync,
// token revocation). Uses Redis sorted sets as a persistent queue with
// retry timestamps as scores.
//
// Architecture:
//   - Pending queue: ZSET "reconciliation:pending" (score = next retry timestamp)
//   - Dead-letter queue: ZSET "reconciliation:dlq" (permanently failed ops)
//   - Idempotency: SET "reconciliation:idem:{hash}" (prevents duplicate processing)
//
// Operations:
//   - token_revocation: Retry blacklisting a JWT
//   - session_sync: Retry creating a session in the gateway
//   - session_revoke: Retry revoking a session
//
// Redis pattern: All Redis access goes through the process-level singleton
// pool exported by lib/redis.ts. Never create or quit connections here.

import {
  withClientSpan,
  addSpanAttributes,
  addSpanEvent,
  injectTraceContext,
  extractTraceContextFromCarrier,
  getActiveTraceId,
} from "@/lib/tracing";
import { getInternalApiTokenCandidates } from "@/lib/internal-api-token";
import { context } from "@opentelemetry/api";
import { type Redis } from "ioredis";
import { getRedisPool, isCircuitOpen } from "@/lib/redis";
import { logEvent } from "@/lib/writeright-logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationOp =
  | { type: "token_revocation"; jti: string; ttl_secs: number }
  | {
      type: "session_sync";
      sessionId: string;
      userId: string;
      expiresAt: number;
      expectedVersion: number;
    }
  | {
      type: "session_revoke";
      sessionId: string;
      jti?: string;
      tokenExp?: number;
      targetVersion?: number;
    };

export interface QueueEntry {
  id: string;
  op: ReconciliationOp;
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  traceparent?: string;
  tracestate?: string;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PENDING_QUEUE = "reconciliation:pending";
const DLQ_QUEUE = "reconciliation:dlq";
const IDEM_PREFIX = "reconciliation:idem:";
const IDEM_TTL_SECS = 86400; // 24 hours
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_QUEUE_SIZE = 5_000;
const CIRCUIT_FAILURE_THRESHOLD = 20;
const CIRCUIT_COOLDOWN_MS = 30_000;
const WORKER_LOCK_TTL_SECS = 15;
const MAX_ENQUEUE_PER_SECOND = 200;
const SESSION_VERSION_PREFIX = "session_version:";
const WORKER_OWNER = typeof process !== "undefined" && typeof process.pid === "number"
  ? `worker:${process.pid}`
  : "worker:edge";

const circuitState = {
  openUntil: 0,
  failures: 0,
};
const enqueueWindow = {
  sec: 0,
  count: 0,
};

// ---------------------------------------------------------------------------
// Queue Operations (using fetch to Redis-backed gateway internal API)
// ---------------------------------------------------------------------------

/**
 * Enqueue a failed operation for async retry.
 * Called from logout/sync failure paths.
 */
export async function enqueueReconciliation(
  op: ReconciliationOp,
): Promise<void> {
  if (!allowEnqueueNow()) {
    incrementMetric("reconciliation_enqueue_ratelimited_total", {
      type: op.type,
    });
    return;
  }

  const entry: QueueEntry = {
    id: generateOperationId(op),
    op,
    attempt: 0,
    maxAttempts: MAX_ATTEMPTS,
    createdAt: Date.now(),
    traceparent: "",
    tracestate: "",
  };

  // Use the process-level singleton Redis pool.
  if (isCircuitOpen()) {
    console.error("[reconciliation] Cannot enqueue: Redis circuit is open");
    incrementMetric("reconciliation_enqueue_ratelimited_total", { type: op.type });
    return;
  }
  const redis = getRedisPool();

  try {
    const [pendingCount, dlqCount] = await Promise.all([
      redis.zcard(PENDING_QUEUE),
      redis.zcard(DLQ_QUEUE),
    ]);

    if (pendingCount >= MAX_QUEUE_SIZE) {
      console.error(
        `[reconciliation] Queue full (pending=${pendingCount}, dlq=${dlqCount}), dropping enqueue for ${entry.id}`,
      );
      return;
    }

    if (op.type === "session_sync" || op.type === "session_revoke") {
      await ensureSessionVersion(op, redis);
    }

    const traceHeaders = injectTraceContext(new Headers());
    entry.traceparent = traceHeaders.traceparent;
    entry.tracestate = traceHeaders.tracestate;

    // Idempotency check — don't enqueue if already processing
    const idemKey = `${IDEM_PREFIX}${entry.id}`;
    const exists = await redis.exists(idemKey);
    if (exists) {
      logEvent("reconciliation.idempotent_skip", { id: entry.id });
      return;
    }

    // Set idempotency key
    await redis.setex(idemKey, IDEM_TTL_SECS, "1");

    // Add to sorted set with score = now (process immediately)
    const score = Date.now();
    await redis.zadd(PENDING_QUEUE, score, JSON.stringify(entry));

    logEvent("reconciliation.enqueued", { 
      type: entry.op.type, 
      id: entry.id 
    });

    // Metrics
    incrementMetric("reconciliation_enqueued_total", { type: entry.op.type });
  } catch (err) {
    console.error("[reconciliation] Failed to enqueue:", err);
  }
}

/**
 * Process pending reconciliation operations.
 * Called by the background worker loop.
 */
export async function processPendingOperations(): Promise<number> {
  if (Date.now() < circuitState.openUntil || isCircuitOpen()) {
    return 0;
  }

  const redis = getRedisPool();

  let processed = 0;

  try {
    const now = Date.now();

    // Get entries whose retry timestamp has passed
    const entries = await redis.zrangebyscore(
      PENDING_QUEUE,
      "-inf",
      now.toString(),
      "LIMIT",
      0,
      BATCH_SIZE,
    );

    for (const entryJson of entries) {
      let entry: QueueEntry;
      try {
        entry = JSON.parse(entryJson);
      } catch {
        // Malformed entry — move to DLQ
        await redis.zrem(PENDING_QUEUE, entryJson);
        await redis.zadd(DLQ_QUEUE, now, entryJson);
        continue;
      }

      const lockKey = `reconciliation:lock:${entry.id}`;
      const lockValue = `${WORKER_OWNER}:${Date.now()}`;
      const claimed = await redis.set(
        lockKey,
        lockValue,
        "EX",
        WORKER_LOCK_TTL_SECS,
        "NX",
      );
      if (claimed !== "OK") {
        continue;
      }

      // Remove from pending only after acquiring a short-lived worker lock.
      const removed = await redis.zrem(PENDING_QUEUE, entryJson);
      if (removed === 0) {
        await redis.del(lockKey);
        continue; // Another worker claimed it
      }

      entry.attempt += 1;

      try {
        const parentCtx = extractTraceContextFromCarrier({
          traceparent: entry.traceparent,
          tracestate: entry.tracestate,
        });

        await context.with(parentCtx, async () => {
          await withClientSpan(
            `reconciliation.process.${entry.op.type}`,
            async () => {
              addSpanAttributes({
                "reconciliation.id": entry.id,
                "reconciliation.type": entry.op.type,
                "reconciliation.attempt": entry.attempt,
              });

              await executeOperation(entry.op, redis);
              addSpanEvent("reconciliation.success");
            },
            {
              "reconciliation.type": entry.op.type,
            },
          );
        });

        // Success — clean up idempotency key
        await redis.del(`${IDEM_PREFIX}${entry.id}`);
        await redis.del(lockKey);
        processed++;
        circuitState.failures = 0;
        incrementMetric("reconciliation_processed_total", { type: entry.op.type });

        logEvent("reconciliation.processed", {
          type: entry.op.type,
          id: entry.id,
          attempt: entry.attempt
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        entry.lastError = errorMsg;
        circuitState.failures += 1;
        if (circuitState.failures >= CIRCUIT_FAILURE_THRESHOLD) {
          circuitState.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          incrementMetric("reconciliation_circuit_open_total", {
            type: entry.op.type,
          });
          console.error(
            `[reconciliation] Circuit opened for ${CIRCUIT_COOLDOWN_MS}ms after ${circuitState.failures} consecutive failures`,
          );
        }

        if (entry.attempt >= entry.maxAttempts) {
          // Exhausted retries — move to DLQ
          await redis.zadd(DLQ_QUEUE, now, JSON.stringify(entry));
          // Prune DLQ entries older than 7 days
          const dlqCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          await redis.zremrangebyscore(DLQ_QUEUE, "-inf", dlqCutoff.toString());
          await redis.del(`${IDEM_PREFIX}${entry.id}`);
          await redis.del(lockKey);
          incrementMetric("reconciliation_dlq_total", { type: entry.op.type });

          console.error(
            `[reconciliation] DLQ: ${entry.op.type} (id: ${entry.id}) after ${entry.attempt} attempts: ${errorMsg}`,
          );
        } else {
          // Retry with exponential backoff
          const delay = BASE_DELAY_MS * Math.pow(2, entry.attempt - 1);
          const nextRetry = Date.now() + delay;
          await redis.zadd(PENDING_QUEUE, nextRetry, JSON.stringify(entry));
          await redis.del(lockKey);
          incrementMetric("reconciliation_retried_total", { type: entry.op.type });

          logEvent("reconciliation.retry_scheduled", {
            type: entry.op.type,
            id: entry.id,
            attempt: entry.attempt,
            delayMs: delay
          });
        }
      }
    }
  } catch (err) {
    console.error("[reconciliation] Worker error:", err);
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Operation Execution
// ---------------------------------------------------------------------------

async function executeOperation(op: ReconciliationOp, redis: Redis): Promise<void> {
  const gatewayInternal =
    process.env.AUTH_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:9091";
  const internalTokens = await getInternalApiTokenCandidates();
  if (internalTokens.length === 0) {
    throw new Error("Internal API token is not configured");
  }

  const traceHeaders = injectTraceContext(new Headers());

  switch (op.type) {
    case "token_revocation": {
      if (op.ttl_secs <= 0) {
        return;
      }

      await redis.setex(`blacklist:${op.jti}`, op.ttl_secs, "1");
      break;
    }

    case "session_sync": {
      const version = await getSessionVersion(redis, op.sessionId);
      if (version !== op.expectedVersion) {
        return;
      }

      const res = await fetchWithTokenFallback(
        `${gatewayInternal}/v1/auth/session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...traceHeaders,
          },
          body: JSON.stringify({
            sid: op.sessionId,
            user_id: op.userId,
            issued_at: Math.floor(Date.now() / 1000),
            device_info: null,
            expires_at: op.expiresAt,
          }),
          signal: AbortSignal.timeout(5000),
        },
        internalTokens,
      );
      if (!res.ok) {
        throw new Error(`Session sync failed: ${res.status}`);
      }
      break;
    }

    case "session_revoke": {
      if (typeof op.targetVersion === "number") {
        const version = await getSessionVersion(redis, op.sessionId);
        if (version < op.targetVersion) {
          await setSessionVersion(redis, op.sessionId, op.targetVersion);
        }
      }

      const params = new URLSearchParams();
      if (op.jti) params.set("jti", op.jti);
      if (op.tokenExp) params.set("token_exp", op.tokenExp.toString());
      const qs = params.toString();

      const res = await fetchWithTokenFallback(
        `${gatewayInternal}/v1/auth/session/${encodeURIComponent(op.sessionId)}${qs ? `?${qs}` : ""}`,
        {
          method: "DELETE",
          headers: {
            ...traceHeaders,
          },
          signal: AbortSignal.timeout(5000),
        },
        internalTokens,
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`Session revoke failed: ${res.status}`);
      }
      break;
    }
  }
}

async function fetchWithTokenFallback(
  url: string,
  init: RequestInit,
  tokens: string[],
): Promise<Response> {
  const baseHeaders = new Headers(init.headers);
  let lastUnauthorized: Response | null = null;

  for (const token of tokens) {
    const headers = new Headers(baseHeaders);
    headers.set("x-internal-api-token", token);

    const res = await fetch(url, {
      ...init,
      headers,
    });

    if (res.status === 401 || res.status === 403) {
      lastUnauthorized = res;
      continue;
    }

    return res;
  }

  if (lastUnauthorized) {
    return lastUnauthorized;
  }

  throw new Error("No internal API token candidates available");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateOperationId(op: ReconciliationOp): string {
  switch (op.type) {
    case "token_revocation":
      return `revoke:${op.jti}`;
    case "session_sync":
      return `sync:${op.sessionId}:v${op.expectedVersion}`;
    case "session_revoke":
      return typeof op.targetVersion === "number"
        ? `logout:${op.sessionId}:v${op.targetVersion}`
        : `logout:${op.sessionId}`;
  }
}

function allowEnqueueNow(): boolean {
  const sec = Math.floor(Date.now() / 1000);
  if (enqueueWindow.sec !== sec) {
    enqueueWindow.sec = sec;
    enqueueWindow.count = 0;
  }
  enqueueWindow.count += 1;
  return enqueueWindow.count <= MAX_ENQUEUE_PER_SECOND;
}

async function ensureSessionVersion(
  op:
    | Extract<ReconciliationOp, { type: "session_sync" }>
    | Extract<ReconciliationOp, { type: "session_revoke" }>,
  redis: Redis,
): Promise<void> {
  if (op.type === "session_sync") {
    await setSessionVersion(redis, op.sessionId, op.expectedVersion);
    return;
  }
  if (typeof op.targetVersion === "number") {
    await setSessionVersion(redis, op.sessionId, op.targetVersion);
  }
}

function sessionVersionKey(sessionId: string): string {
  return `${SESSION_VERSION_PREFIX}${sessionId}`;
}

export async function getSessionVersion(
  redis: Redis,
  sessionId: string,
): Promise<number> {
  const raw = await redis.get(sessionVersionKey(sessionId));
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function bumpSessionVersion(
  sessionId: string,
): Promise<number> {
  const redis = getRedisPool();

  try {
    const next = await redis.incr(sessionVersionKey(sessionId));
    await redis.expire(sessionVersionKey(sessionId), IDEM_TTL_SECS);
    return next;
  } catch (err) {
    console.error("[reconciliation] bumpSessionVersion failed:", err);
    return 0;
  }
}

export async function readSessionVersion(
  sessionId: string,
): Promise<number> {
  const redis = getRedisPool();
  try {
    return await getSessionVersion(redis, sessionId);
  } catch (err) {
    console.error("[reconciliation] readSessionVersion failed:", err);
    return 0;
  }
}

async function setSessionVersion(
  redis: Redis,
  sessionId: string,
  version: number,
): Promise<void> {
  const key = sessionVersionKey(sessionId);
  const current = await getSessionVersion(redis, sessionId);
  if (version > current) {
    await redis.setex(key, IDEM_TTL_SECS, String(version));
  }
}

function incrementMetric(name: string, labels: Record<string, string>): void {
  // In production, this would increment a Prometheus counter
  // For now, log the metric via logEvent
  const traceId = getActiveTraceId();
  logEvent("metric.increment", {
    name,
    labels,
    traceId
  });
}

// ---------------------------------------------------------------------------
// Redis Pool Access
// ---------------------------------------------------------------------------
//
// All Redis operations use the singleton pool from lib/redis.ts.
// Connection lifecycle (connect, retry, TLS, shutdown) is fully managed there.
// This module MUST NOT create, connect, or quit Redis connections directly.

// ---------------------------------------------------------------------------
// Worker Loop (standalone process or background task)
// ---------------------------------------------------------------------------

/**
 * Start the reconciliation worker loop.
 * In production, run this as a separate process:
 *   node -e "require('./lib/reconciliation-worker').startWorker()"
 *
 * Or embed in the Next.js server via instrumentation.ts.
 */
export async function startWorker(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.warn("[reconciliation] Worker cannot run in Edge Runtime");
    return;
  }

  logEvent("reconciliation.worker_started");

  const shutdown = { requested: false };
  if (typeof process !== "undefined" && process.on) {
    process.on("SIGTERM", () => { shutdown.requested = true; });
    process.on("SIGINT", () => { shutdown.requested = true; });
  }

  while (!shutdown.requested) {
    try {
      const processed = await processPendingOperations();
      if (processed > 0) {
        logEvent("reconciliation.batch_processed", { count: processed });
      }
    } catch (err) {
      console.error("[reconciliation] Worker iteration error:", err);
    }

    // Poll interval
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  logEvent("reconciliation.worker_shutdown");
}

// ---------------------------------------------------------------------------
// Stats / Health Check
// ---------------------------------------------------------------------------

export async function getQueueStats(): Promise<{ pending: number; dlq: number } | null> {
  const redis = getRedisPool();

  try {
    const [pending, dlq] = await Promise.all([
      redis.zrangebyscore(PENDING_QUEUE, "-inf", "+inf"),
      redis.zrangebyscore(DLQ_QUEUE, "-inf", "+inf"),
    ]);
    return { pending: pending.length, dlq: dlq.length };
  } catch (err) {
    console.error("[reconciliation] getQueueStats failed:", err);
    return null;
  }
}
