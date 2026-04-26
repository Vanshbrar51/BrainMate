import { auth } from "@clerk/nextjs/server";
// FILE: lib/writeright-errors.ts — Centralized error handling and toast hook

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode = 
  | "UNAUTHORIZED" | "INVALID_BODY" | "INVALID_KEYS" | "MISSING_TEXT" 
  | "EMPTY_TEXT" | "INVALID_TONE" | "INVALID_MODE" | "INVALID_CHAT_ID" 
  | "CHAT_NOT_FOUND" | "DB_ERROR" | "QUEUE_ERROR" | "RATE_LIMITED" 
  | "NOT_FOUND" | "INTERNAL_ERROR" | "TIMEOUT" | "STREAM_ERROR" 
  | "VALIDATION_ERROR";

export class WriteRightError extends Error {
  code: ErrorCode;
  statusHttp: number;
  userMessage: string;
  meta?: Record<string, unknown>;

  constructor(code: ErrorCode, userMessage: string, statusHttp = 500, meta?: Record<string, unknown>) {
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
  userMessage: string, 
  statusHttp = 500, 
  meta?: Record<string, unknown>
): WriteRightError {
  return new WriteRightError(code, userMessage, statusHttp, meta);
}

export function toApiResponse(err: unknown): NextResponse {
  if (err instanceof WriteRightError) {
    return NextResponse.json(
      { error: err.userMessage, code: err.code, meta: err.meta },
      { status: err.statusHttp }
    );
  }
  
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", code: "VALIDATION_ERROR", issues: err.issues },
      { status: 400 }
    );
  }

  if (err instanceof Error && (err.message.includes("Unauthenticated") || err.message.includes("unauthorized"))) {
    return NextResponse.json(
      { error: "Your session expired. Please refresh the page.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  console.error("[WriteRight] Unhandled API error:", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

import { logRequest } from "./writeright-logger";

export async function withErrorHandler(req: Request, handler: () => Promise<Response>): Promise<Response> {
  const start = Date.now();
  let response: Response;


  try {
    response = await handler();
  } catch (err) {
    response = toApiResponse(err);
  }

  const durationMs = Date.now() - start;
  const url = new URL(req.url);
  
  logRequest({
    route: url.pathname,
    method: req.method,
    userId: (await auth().catch(() => null))?.userId ?? null,
    durationMs,
    statusCode: response.status,
  });

  return response;
}
