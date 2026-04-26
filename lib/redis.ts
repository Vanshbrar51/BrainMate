// lib/redis.ts — Production-grade singleton ioredis client
//
// Architecture:
//   - ONE long-lived ioredis connection per process (singleton pattern).
//   - Next.js hot-reload safe via globalThis guard.
//   - TLS enforced for rediss:// URLs (rejectUnauthorized: true).
//   - Retry strategy: exponential backoff, jittered, capped at 10 retries / 3s.
//   - Circuit breaker: tracks consecutive failures, opens on threshold.
//   - Observability: structured log events on connect, close, error, ready.
//   - Graceful shutdown: call shutdownRedisPool() in process SIGTERM handlers.
//
// Usage:
//   import { getRedisPool, ns } from "@/lib/redis";
//   const redis = getRedisPool();
//   await redis.set(ns("session", sessionId), value, "EX", 3600);

import { type Redis as RedisClient } from "ioredis";

// ---------------------------------------------------------------------------
// Configuration — read once at module load, never from untrusted input
// ---------------------------------------------------------------------------

function getRedisUrl(): string {
  const url =
    process.env.REDIS_URL ??
    process.env.REDIS_PRIMARY_URL ??
    process.env.AUTH_REDIS_PRIMARY_URL;

  if (!url) {
    // In test environments, fall back to localhost so tests don't crash.
    if (process.env.NODE_ENV === "test") {
      return "redis://127.0.0.1:6379";
    }
    throw new Error(
      "[redis] No Redis URL configured. Set REDIS_URL in your environment.",
    );
  }

  return url;
}

/** Connect timeout in ms (default: 5s, matches REDIS_CONNECT_TIMEOUT_SECS). */
function getConnectTimeoutMs(): number {
  const envSecs = parseInt(
    process.env.REDIS_CONNECT_TIMEOUT_SECS ?? "5",
    10,
  );
  return Number.isFinite(envSecs) ? envSecs * 1000 : 5_000;
}

/** Per-command timeout in ms (default: 3s). */
const COMMAND_TIMEOUT_MS = 3_000;

/** Maximum number of reconnection attempts before giving up. */
const MAX_RETRIES = 10;

/** Base backoff delay in ms. */
const BASE_BACKOFF_MS = 200;

/** Maximum backoff delay cap in ms. */
const MAX_BACKOFF_MS = 3_000;

// ---------------------------------------------------------------------------
// Circuit Breaker State (module-level, shared across all callers)
// ---------------------------------------------------------------------------

interface CircuitState {
  consecutiveErrors: number;
  openUntil: number; // epoch ms
  totalErrors: number;
  totalConnects: number;
}

const _circuit: CircuitState = {
  consecutiveErrors: 0,
  openUntil: 0,
  totalErrors: 0,
  totalConnects: 0,
};

const CIRCUIT_ERROR_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 15_000;

export function isCircuitOpen(): boolean {
  return Date.now() < _circuit.openUntil;
}

export function getCircuitStats(): Readonly<CircuitState> {
  return { ..._circuit };
}

// ---------------------------------------------------------------------------
// Key Namespace Helper
// ---------------------------------------------------------------------------

/**
 * Build a namespaced Redis key. Prevents key collisions across modules.
 * Example: ns("session", sessionId) → "session:abc123"
 *          ns("rate_limit", "ip", "1.2.3.4") → "rate_limit:ip:1.2.3.4"
 */
export function ns(...parts: string[]): string {
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Retry Strategy
// ---------------------------------------------------------------------------

/**
 * ioredis retryStrategy callback.
 * Returns the delay in ms before the next reconnect attempt, or null to stop.
 *
 * Strategy: exponential backoff with full jitter.
 * Attempt 1: 200ms  (±100%)
 * Attempt 2: 400ms  (±100%)
 * ...
 * Attempt 10: 3000ms (capped)
 */
function retryStrategy(times: number): number | null {
  if (times > MAX_RETRIES) {
    console.error(
      `[redis] Exceeded ${MAX_RETRIES} reconnection attempts. Giving up.`,
    );
    return null; // Stop retrying — ioredis will emit 'close'
  }

  const base = Math.min(BASE_BACKOFF_MS * Math.pow(2, times - 1), MAX_BACKOFF_MS);
  const jitter = Math.random() * base;
  const delay = Math.round(jitter);

  console.warn(
    `[redis] Connection lost. Retry attempt ${times}/${MAX_RETRIES} in ${delay}ms`,
  );

  return delay;
}

// ---------------------------------------------------------------------------
// TLS Options
// ---------------------------------------------------------------------------

/**
 * Detect whether the URL is a TLS (rediss://) connection.
 * When true, enforce certificate verification.
 */
function buildTlsOptions(url: string): Record<string, unknown> | undefined {
  if (url.startsWith("rediss://")) {
    return {
      rejectUnauthorized: true,
      // If you need a custom CA (e.g. self-signed cert in staging), set:
      // ca: process.env.REDIS_TLS_CA_CERT,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Singleton Pool State
// ---------------------------------------------------------------------------

let _poolInstance: RedisClient | null = null;

/**
 * Initialize the Redis singleton. MUST be called and awaited during
 * application bootstrap (e.g., in instrumentation.ts).
 */
export async function initRedisPool(): Promise<RedisClient> {
  if (process.env.NODE_ENV !== "production") {
    if (!globalThis.__ioredis_pool__ || globalThis.__ioredis_pool__.status === "end") {
      globalThis.__ioredis_pool__ = await createRedisClient();
    }
    return globalThis.__ioredis_pool__;
  }

  if (!_poolInstance || _poolInstance.status === "end") {
    _poolInstance = await createRedisClient();
  }
  return _poolInstance;
}

// ---------------------------------------------------------------------------
// Client Factory
// ---------------------------------------------------------------------------

async function createRedisClient(): Promise<RedisClient> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    throw new Error("[redis] ioredis is not supported in the Edge Runtime");
  }

  const Redis = (await import("ioredis")).default;
  const url = getRedisUrl();
  const tlsOptions = buildTlsOptions(url);

  // Parse URL manually using WHATWG URL to avoid ioredis triggering Node's legacy url.parse().
  // See DEP0169: https://nodejs.org/api/deprecations.html#DEP0169
  const parsedUrl = new URL(url);

  const client = new Redis({
    host: parsedUrl.hostname,
    port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (tlsOptions ? 6380 : 6379),
    username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
    password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
    db: parsedUrl.pathname && parsedUrl.pathname !== "/" ? parseInt(parsedUrl.pathname.slice(1), 10) : 0,

    // Connection
    connectTimeout: getConnectTimeoutMs(),
    commandTimeout: COMMAND_TIMEOUT_MS,
    enableReadyCheck: true,
    lazyConnect: false, // Connect eagerly — not per-call

    // Retry
    retryStrategy,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true, // Buffer commands while reconnecting

    // TLS
    ...(tlsOptions ? { tls: tlsOptions } : {}),

    // Keepalive — prevents idle TCP connections from being silently dropped
    // by cloud load balancers (e.g., RedisLabs drops at 300s idle).
    keepAlive: 60_000,

    // Do not auto-select DB 0 explicitly so that DB specified in the URL
    // (if any) is respected.
  });

  // -------------------------------------------------------------------------
  // Observability Event Hooks
  // -------------------------------------------------------------------------

  client.on("connect", () => {
    _circuit.consecutiveErrors = 0;
    _circuit.totalConnects += 1;
    console.info(
      `[redis] Connected to ${maskUrl(url)} (connect #${_circuit.totalConnects})`,
    );
  });

  client.on("ready", () => {
    console.info("[redis] Connection ready — commands can be issued");
  });

  client.on("error", (err: Error) => {
    _circuit.consecutiveErrors += 1;
    _circuit.totalErrors += 1;

    if (_circuit.consecutiveErrors >= CIRCUIT_ERROR_THRESHOLD) {
      _circuit.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      console.error(
        `[redis] Circuit OPEN for ${CIRCUIT_COOLDOWN_MS / 1000}s after ${_circuit.consecutiveErrors} consecutive errors`,
      );
    }

    // Avoid logging the full URL (it contains credentials)
    console.error(
      `[redis] Error (consecutive: ${_circuit.consecutiveErrors}): ${err.message}`,
    );
  });

  client.on("close", () => {
    console.warn("[redis] Connection closed");
  });

  client.on("reconnecting", (delay: number) => {
    console.warn(`[redis] Reconnecting in ${delay}ms…`);
  });

  client.on("end", () => {
    console.warn("[redis] Connection ended — no more reconnect attempts");
    // Clear singleton so the next call recreates the client
    // (only relevant if shutdownRedisPool was NOT called explicitly)
    _poolInstance = null;
  });

  return client;
}

// ---------------------------------------------------------------------------
// Singleton Pool
// ---------------------------------------------------------------------------

// globalThis guard prevents multiple client instances during Next.js hot-reload
// in development, where Node module cache is partially invalidated.
declare global {

  var __ioredis_pool__: RedisClient | undefined;
}

/**
 * Returns the process-level singleton ioredis client.
 *
 * Thread-safety: Node.js is single-threaded — this is safe.
 * Hot-reload safety: Uses globalThis guard so Next.js dev mode doesn't
 * create multiple connections on module re-evaluation.
 */
export function getRedisPool(): RedisClient {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    throw new Error("[redis] Cannot access Redis pool in the Edge Runtime");
  }

  // In Next.js dev mode, use globalThis to survive module cache refreshes.
  if (process.env.NODE_ENV !== "production") {
    if (!globalThis.__ioredis_pool__ || globalThis.__ioredis_pool__.status === "end") {
      throw new Error("[redis] Dev pool not initialized. Ensure createRedisClient was awaited during startup.");
    }
    return globalThis.__ioredis_pool__;
  }

  // In production, module cache is stable — use module-level variable.
  if (!_poolInstance || _poolInstance.status === "end") {
    throw new Error("[redis] Production pool not initialized. Ensure createRedisClient was awaited during startup.");
  }

  return _poolInstance;
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully close the Redis connection.
 * Call this in your process SIGTERM / SIGINT handlers or instrumentation
 * shutdown hooks.
 *
 * Uses QUIT command (waits for in-flight commands to complete) rather than
 * disconnect() (which closes immediately, potentially dropping commands).
 */
export async function shutdownRedisPool(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const client = _poolInstance ?? globalThis.__ioredis_pool__;
  if (!client || client.status === "end") return;

  try {
    console.info("[redis] Shutting down Redis connection pool…");
    await client.quit();
    console.info("[redis] Redis connection closed gracefully");
  } catch (err) {
    // If QUIT fails (e.g., already closed), just disconnect.
    client.disconnect();
    console.warn("[redis] Forced disconnect during shutdown:", err);
  } finally {
    _poolInstance = null;
    globalThis.__ioredis_pool__ = undefined;
  }
}

// ---------------------------------------------------------------------------
// URL Masking (for safe logging — never log credentials)
// ---------------------------------------------------------------------------

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) {
      u.password = "***";
    }
    return u.toString();
  } catch {
    return "redis://***";
  }
}
