// FILE: lib/writeright-errors.ts — Centralized error handling for WriteRight
// ── CHANGED: [BE-1] Centralized Error Handler ──

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logRequest } from "./writeright-logger";

// ── NEW: [BE-1] Complete ErrorCode union ──
export type ErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_BODY"
  | "VALIDATION_ERROR"
  | "MISSING_TEXT"
  | "EMPTY_TEXT"
  | "INVALID_TONE"
  | "INVALID_MODE"
  | "INVALID_CHAT_ID"
  | "INVALID_KEYS"
  | "CHAT_NOT_FOUND"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "DB_ERROR"
  | "QUEUE_ERROR"
  | "TIMEOUT"
  | "STREAM_ERROR"
  | "MISSING_SECRET"
  | "WORKER_ERROR"
  | "INTERNAL_ERROR";

// ── NEW: [BE-1] User-facing error copy table ──
const USER_MESSAGES: Partial<Record<ErrorCode, string>> = {
  RATE_LIMITED: "You're moving fast! Wait a moment and try again.",
  QUEUE_ERROR: "Our servers are busy. Please try again in a few seconds.",
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
  const httpStatus = status ?? (code === "UNAUTHORIZED" ? 401 : code === "RATE_LIMITED" ? 429 : code === "NOT_FOUND" || code === "CHAT_NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" || code === "INVALID_BODY" || code === "EMPTY_TEXT" || code === "MISSING_TEXT" ? 400 : 500);
  return new WriteRightError(code, safeMessage, httpStatus, meta);
}

// ── NEW: [BE-1] Safe response converter ──
export function toApiResponse(err: unknown): NextResponse {
  if (err instanceof WriteRightError) {
    const headers: Record<string, string> = {};
    // Attach rate limit headers if present in meta
    if (err.meta?.headers && typeof err.meta.headers === "object") {
      const rlHeaders = err.meta.headers as Record<string, string>;
      for (const [key, value] of Object.entries(rlHeaders)) {
        headers[key] = value;
      }
    }
    return NextResponse.json(
      { error: err.userMessage, code: err.code, meta: err.meta },
      { status: err.statusHttp, headers },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: USER_MESSAGES.VALIDATION_ERROR ?? "Invalid input",
        code: "VALIDATION_ERROR" as ErrorCode,
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
        error: USER_MESSAGES.UNAUTHORIZED ?? "Session expired. Please refresh.",
        code: "UNAUTHORIZED" as ErrorCode,
      },
      { status: 401 },
    );
  }

  console.error("[WriteRight] Unhandled API error:", err);
  return NextResponse.json(
    {
      error: USER_MESSAGES.INTERNAL_ERROR ?? "Something went wrong. We've been notified.",
      code: "INTERNAL_ERROR" as ErrorCode,
    },
    { status: 500 },
  );
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
            .catch(() => ({}))) as { code?: string }).code
        : undefined,
  });

  return response;
}

// ── NEW: [BE-1] Helper to get safe user message for a code ──
export function getUserMessage(code: ErrorCode): string {
  return USER_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
