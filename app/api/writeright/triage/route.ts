// app/api/writeright/triage/route.ts — Secure gateway for bulk inbox triage
//
// Proxies bulk text dumps to the Python worker for segmentation and analysis.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token";

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.triage.post", async () => {
      // 1. Authenticate
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      // 2. Parse body
      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const { raw_text, chatId } = body;

      if (!raw_text) {
        throw createApiError("VALIDATION_ERROR", "Missing raw_text for triage", 400);
      }

      addSpanAttributes({ "user.id": userId, "writeright.triage.length": raw_text.length });

      // 3. Optional Chat Ownership check (if chatId is provided)
      if (chatId) {
        const supabase = getSupabaseAdmin();
        const { data: chat, error: chatError } = await supabase
          .from("writeright_chats")
          .select("id")
          .eq("id", chatId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .single();

        if (chatError || !chat) {
          throw createApiError("CHAT_NOT_FOUND", "Chat context not found", 404);
        }
      }

      // 4. Inject trace context
      const traceHeaders = injectTraceContext(new Headers());

      // 5. Proxy to Python worker (Non-streaming for bulk JSON)
      const pythonRes = await fetch(`${PYTHON_WORKER_URL}/triage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
        body: JSON.stringify({
          raw_text,
          traceparent: traceHeaders.traceparent,
        }),
      });

      if (!pythonRes.ok) {
        const errorText = await pythonRes.text();
        console.error("[api.writeright.triage] Python worker error:", errorText);
        throw createApiError("WORKER_ERROR", "Failed to triage text", 502);
      }

      const triageData = await pythonRes.json();

      return NextResponse.json(triageData);
    });
  });
}
