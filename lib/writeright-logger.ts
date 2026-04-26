// FILE: lib/writeright-logger.ts — Structured JSON logging for WriteRight API routes
// ── CHANGED: [BE-6] Enhanced structured logger ──

import { getActiveTraceId } from "./tracing";

export interface RequestLogContext {
  route: string;
  method: string;
  userId: string | null;
  durationMs: number;
  statusCode: number;
  traceId?: string;
  errorCode?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

// ── CHANGED: [BE-6] logRequest with automatic traceId injection ──
export function logRequest(ctx: RequestLogContext): void {
  // Auto-inject traceId from active OTel span if not provided
  const traceId = ctx.traceId ?? getActiveTraceId() ?? undefined;
  const entry = {
    timestamp: new Date().toISOString(),
    level: ctx.statusCode >= 500 ? "error" : ctx.statusCode >= 400 ? "warn" : "info",
    ...ctx,
    traceId,
  };

  if (process.env.NODE_ENV === "production") {
    // Structured JSON for log aggregation (Datadog, CloudWatch, etc.)
    console.log(JSON.stringify(entry));
  } else {
    // Pretty-print with colors for development
    const isError = ctx.statusCode >= 400;
    const color = ctx.statusCode >= 500
      ? "\x1b[31m" // red
      : ctx.statusCode >= 400
        ? "\x1b[33m" // yellow
        : "\x1b[32m"; // green
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";

    const parts = [
      `${dim}[WriteRight]${reset}`,
      `${color}${ctx.method} ${ctx.route}${reset}`,
      `${ctx.statusCode}`,
      `${ctx.durationMs.toFixed(0)}ms`,
    ];

    if (ctx.userId) parts.push(`${dim}uid:${ctx.userId.slice(0, 12)}…${reset}`);
    if (ctx.errorCode) parts.push(`${color}[${ctx.errorCode}]${reset}`);
    if (ctx.error) parts.push(`${color}${ctx.error}${reset}`);
    if (traceId) parts.push(`${dim}trace:${traceId.slice(0, 8)}…${reset}`);

    if (isError) {
      console.error(parts.join(" · "));
    } else {
      console.log(parts.join(" · "));
    }
  }
}

// ── NEW: [BE-6] Convenience loggers for specific events ──
export function logEvent(
  event: string,
  meta?: Record<string, unknown>,
): void {
  const traceId = getActiveTraceId() ?? undefined;
  if (process.env.NODE_ENV === "production") {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event,
        traceId,
        ...meta,
      }),
    );
  } else {
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";
    console.log(
      `${dim}[WriteRight]${reset} ${event}${meta ? ` ${JSON.stringify(meta)}` : ""}`,
    );
  }
}

export function logError(
  event: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const traceId = getActiveTraceId() ?? undefined;
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV === "production") {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event,
        error: errorMessage,
        traceId,
        ...meta,
      }),
    );
  } else {
    console.error(
      `\x1b[31m[WriteRight] ${event}\x1b[0m: ${errorMessage}`,
      meta ?? "",
    );
  }
}

// END FILE: lib/writeright-logger.ts
