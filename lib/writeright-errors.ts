// FILE: lib/writeright-errors.ts — Centralized error handling for WriteRight
// ── CHANGED: [BE-1] Centralized Error Handler ──

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getActiveTraceId } from "./tracing";
import { logRequest } from "./writeright-logger";

// ── NEW: [BE-1] Complete ErrorCode union ──
export type ErrorCode =
  | "CONFIRMATION_REQUIRED"
  | "QUOTA_EXCEEDED"
  | "TEXT_TOO_LONG"
  | "FILE_TOO_LARGE"
  | "CONFLICT"
  | "MISSING_SECRET"
  | "EXPIRED_TOKEN"
  | "INVALID_TOKEN"
  | "INVALID_CHAT_ID"
  | "INVALID_JOB_ID"
  | "UNAUTHORIZED"
  | "INVALID_BODY"
  | "VALIDATION_ERROR"
  | "MISSING_TEXT"
  | "EMPTY_TEXT"
  | "INVALID_TONE"
  | "INVALID_MODE"
  | "INVALID_KEYS"
  | "CHAT_NOT_FOUND"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "DB_ERROR"
  | "QUEUE_ERROR"
  | "TIMEOUT"
  | "STREAM_ERROR"
  | "WORKER_ERROR"
  | "INTERNAL_ERROR";

// ── NEW: [BE-1] User-facing error copy table ──
const USER_MESSAGES: Partial<Record<ErrorCode, string>> = {
  RATE_LIMITED: "You're moving fast! Wait a moment and try again.",
  QUEUE_ERROR: "Service is busy. Please try again in a moment.",
  TIMEOUT: "This took too long. Try with shorter text.",
  DB_ERROR: "Something went wrong saving your data.",
  UNAUTHORIZED: "Session expired. Please refresh.",
  INTERNAL_ERROR: "Something went wrong. We've been notified.",
  STREAM_ERROR: "Live preview interrupted. Your result is still being saved.",
  VALIDATION_ERROR: "Invalid input. Please check your data.",
  MISSING_TEXT: "Please enter some text to improve.",
  EMPTY_TEXT: "Text is empty after processing. Please try different text.",
  INVALID_TONE: "Invalid tone selected.",
  INVALID_MODE: "Invalid mode selected.",
  INVALID_CHAT_ID: "Invalid chat reference.",
  CHAT_NOT_FOUND: "Chat not found or does not belong to you.",
  NOT_FOUND: "The requested resource was not found.",
  INVALID_BODY: "Invalid request format.",
  INVALID_KEYS: "Invalid request parameters.",
  WORKER_ERROR: "The AI worker encountered an error. Please try again.",
  QUOTA_EXCEEDED: "Monthly limit reached. Upgrade for more.",
  FILE_TOO_LARGE: "File exceeds the 4MB limit.",
  INVALID_TOKEN: "Invalid share link.",
  EXPIRED_TOKEN: "This share link has expired.",
  MISSING_SECRET: "Share feature unavailable.",
  CONFLICT: "This request was already processed.",
};

export class WriteRightError extends Error {
  code: ErrorCode;
  statusHttp: number;
  userMessage: string;
  meta?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    userMessage: string,
    statusHttp = 500,
    meta?: Record<string, unknown>,
  ) {
    super(userMessage);
    this.name = "WriteRightError";
    this.code = code;
    this.statusHttp = statusHttp;
    this.userMessage = userMessage;
    this.meta = meta;
  }
}

export function createApiError(
  code: ErrorCode,
  msg: string,
  status?: number,
  meta?: Record<string, unknown>,
): WriteRightError {
  // Always prefer the safe user-facing copy
  const safeMessage = USER_MESSAGES[code] ?? msg;
  const httpStatus = status ?? (code === "UNAUTHORIZED" ? 401 : code === "RATE_LIMITED" ? 429 : code === "QUOTA_EXCEEDED" ? 402 : code === "FILE_TOO_LARGE" ? 413 : code === "EXPIRED_TOKEN" ? 410 : code === "CONFLICT" ? 409 : code === "NOT_FOUND" || code === "CHAT_NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" || code === "INVALID_BODY" || code === "EMPTY_TEXT" || code === "MISSING_TEXT" || code === "INVALID_TOKEN" ? 400 : 500);
  return new WriteRightError(code, safeMessage, httpStatus, meta);
}

// ── NEW: [BE-1] Safe response converter ──
export function toApiResponse(err: unknown): NextResponse {
  if (err instanceof WriteRightError) {
    const headers: Record<string, string> = {};
    const meta = err.meta ?? {};
    // Attach rate limit headers if present in meta
    if (meta.headers && typeof meta.headers === "object") {
      const rlHeaders = meta.headers as Record<string, string>;
      for (const [key, value] of Object.entries(rlHeaders)) {
        headers[key] = value;
      }
    }

    const body: Record<string, unknown> = {
      error: err.code,
      message: err.userMessage,
    };
    for (const [key, value] of Object.entries(meta)) {
      if (key !== "headers") body[key] = value;
    }
    if (err.code === "QUOTA_EXCEEDED") {
      body.upgrade_url = typeof body.upgrade_url === "string"
        ? body.upgrade_url
        : "https://brainmate.ai/pricing";
    }
    if (err.code === "INTERNAL_ERROR") {
      body.request_id = getActiveTraceId() ?? "unknown";
    }
    if (err.code === "RATE_LIMITED") {
      for (const [key, value] of Object.entries(headers)) body[key] = value;
    }
    if (err.code === "QUEUE_ERROR" && headers["Retry-After"]) {
      body["Retry-After"] = headers["Retry-After"];
    }

    return NextResponse.json(
      body,
      { status: err.statusHttp, headers },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR" as ErrorCode,
        message: USER_MESSAGES.VALIDATION_ERROR ?? "Invalid input. Please check your data.",
        issues: err.issues,
      },
      { status: 400 },
    );
  }

  if (
    err instanceof Error &&
    (err.message.includes("Unauthenticated") ||
      err.message.includes("unauthorized"))
  ) {
    return NextResponse.json(
      {
        error: "UNAUTHORIZED" as ErrorCode,
        message: USER_MESSAGES.UNAUTHORIZED ?? "Session expired. Please refresh.",
      },
      { status: 401 },
    );
  }

  console.error("[WriteRight] Unhandled API error:", err);
  return NextResponse.json(
    {
      error: "INTERNAL_ERROR" as ErrorCode,
      message: USER_MESSAGES.INTERNAL_ERROR ?? "Something went wrong. We've been notified.",
      request_id: getActiveTraceId() ?? "unknown",
    },
    { status: 500 },
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WriteRightError(
        "TIMEOUT",
        `${label} timed out after ${ms}ms`,
        503,
      ));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── CHANGED: [BE-1] withErrorHandler with structured logging ──
export async function withErrorHandler(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const start = Date.now();
  let response: Response;

  try {
    response = await handler();
  } catch (err) {
    response = toApiResponse(err);
  }

  const durationMs = Date.now() - start;
  const url = new URL(req.url);

  // Non-blocking structured log
  logRequest({
    route: url.pathname,
    method: req.method,
    userId: (await auth().catch(() => null))?.userId ?? null,
    durationMs,
    statusCode: response.status,
    errorCode:
      response.status >= 400
        ? ((await response
            .clone()
            .json()
            .catch(() => ({}))) as { error?: string }).error
        : undefined,
  });

  return response;
}

// ── NEW: [BE-1] Helper to get safe user message for a code ──
export function getUserMessage(code: ErrorCode): string {
  return USER_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
