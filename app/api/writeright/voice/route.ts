// app/api/writeright/voice/route.ts — Secure management for Brand Voice examples
//
// Proxies ingestion requests to the Python worker and lists examples from Supabase.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.voice.list", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      // Proxy to Python worker to list examples (or query Supabase directly)
      // We proxy to maintain consistency and allow the worker to handle data formatting
      const traceHeaders = injectTraceContext(new Headers());
      const res = await fetch(`${PYTHON_WORKER_URL}/voice/examples?user_id=${userId}`, {
        headers: {
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
      });

      if (!res.ok) throw createApiError("WORKER_ERROR", "Failed to fetch examples", 502);

      const data = await res.json();
      return NextResponse.json(data);
    });
  });
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.voice.ingest", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const { content } = body;
      if (!content || typeof content !== "string" || content.length < 20) {
        throw createApiError("VALIDATION_ERROR", "Example text must be at least 20 characters.", 400);
      }

      addSpanAttributes({ "user.id": userId, "writeright.voice.length": content.length });

      // Proxy to Python worker to generate embedding and save
      const traceHeaders = injectTraceContext(new Headers());
      const res = await fetch(`${PYTHON_WORKER_URL}/voice/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
        body: JSON.stringify({
          user_id: userId,
          content,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("[api.writeright.voice] Ingestion failed:", err);
        throw createApiError("WORKER_ERROR", "Failed to process style example", 502);
      }

      const result = await res.json();
      return NextResponse.json(result);
    });
  });
}
