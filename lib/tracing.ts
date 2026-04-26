// lib/tracing.ts — OpenTelemetry tracing utilities for Next.js
//
// Provides helper functions used by middleware and API routes to create spans,
// propagate trace context across service boundaries, and record attributes.

import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Context,
  type Span,
  SpanKind,
} from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Tracer
// ---------------------------------------------------------------------------
const tracer = trace.getTracer('brainmate-ai', '0.1.0');

// ---------------------------------------------------------------------------
// Context Propagation (W3C Trace Context)
// ---------------------------------------------------------------------------

/**
 * Extract trace context from incoming request headers.
 * Returns an OTel Context that can be used as parent for child spans.
 */
export function extractTraceContext(headers: Headers): Context {
  const carrier: Record<string, string> = {};
  headers.forEach((value, key) => {
    carrier[key] = value;
  });
  return propagation.extract(context.active(), carrier);
}

export function extractTraceContextFromCarrier(
  carrier: Record<string, string | undefined>,
): Context {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(carrier)) {
    if (typeof value === "string" && value.length > 0) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return propagation.extract(context.active(), normalized);
}

/**
 * Inject trace context into outgoing request headers.
 * Mutates the provided Headers object and returns it for convenience.
 */
export function injectTraceContext(headers: Headers): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  for (const [key, value] of Object.entries(carrier)) {
    headers.set(key, value);
  }
  return carrier;
}

export function getActiveTraceId(): string | null {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) return null;
  const traceId = activeSpan.spanContext().traceId;
  return traceId && traceId !== "00000000000000000000000000000000"
    ? traceId
    : null;
}

export function traceLogFields(): Record<string, string> {
  const traceId = getActiveTraceId();
  return traceId ? { trace_id: traceId } : {};
}

// ---------------------------------------------------------------------------
// Span Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap an async function with a traced span.
 *
 * @param name - Span name (e.g. "clerk-auth-protect")
 * @param fn - Async function to execute within the span
 * @param parentCtx - Optional parent context for linking to an upstream trace
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  parentCtx?: Context,
): Promise<T> {
  const ctx = parentCtx ?? context.active();
  return context.with(ctx, () =>
    tracer.startActiveSpan(
      name,
      { kind: SpanKind.INTERNAL },
      ctx,
      async (span: Span) => {
        try {
          const result = await fn();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setAttribute('app.error', true);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.recordException(
            error instanceof Error ? error : new Error(String(error)),
          );
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
}

/**
 * Wrap an async function with a CLIENT span (outgoing HTTP calls).
 */
export async function withClientSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.CLIENT },
    async (span: Span) => {
      try {
        if (attributes) {
          for (const [key, value] of Object.entries(attributes)) {
            span.setAttribute(key, value);
          }
        }
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('app.error', true);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Add attributes to the currently active span (no-op if no span active).
 */
export function addSpanAttributes(
  attributes: Record<string, unknown>,
): void {
  const span = trace.getSpan(context.active());
  if (!span) return;
  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      span.setAttribute(key, value);
    }
  }
}

/**
 * Record an event on the currently active span.
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const span = trace.getSpan(context.active());
  if (!span) return;
  span.addEvent(name, attributes);
}
