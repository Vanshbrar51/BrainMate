// app/api/writeright/morph/route.ts — Direct streaming morphing gateway
//
// This route proxies requests to the Python worker's /morph endpoint
// to enable ultra-low-latency text manipulation.

import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token";

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.morph.post", async () => {
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

      const { chatId, original_text, current_text, tone, intensity, mode } = body;

      if (!chatId || !original_text || !current_text || !tone || !intensity || !mode) {
        throw createApiError("VALIDATION_ERROR", "Missing required fields", 400);
      }

      addSpanAttributes({ "user.id": userId, "writeright.chat_id": chatId });

      // 3. Verify chat ownership
      const supabase = getSupabaseAdmin();
      const { data: chat, error: chatError } = await supabase
        .from("writeright_chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (chatError || !chat) {
        throw createApiError("CHAT_NOT_FOUND", "Chat not found or access denied", 404);
      }

      // 4. Inject trace context
      const traceHeaders = injectTraceContext(new Headers());

      // 5. Proxy to Python worker
      const pythonRes = await fetch(`${PYTHON_WORKER_URL}/morph`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Token": INTERNAL_API_TOKEN,
          ...traceHeaders,
        },
        body: JSON.stringify({
          original_text,
          current_text,
          tone,
          intensity,
          mode,
          traceparent: traceHeaders.traceparent,
        }),
      });

      if (!pythonRes.ok) {
        const errorText = await pythonRes.text();
        console.error("[api.writeright.morph] Python worker error:", errorText);
        throw createApiError("WORKER_ERROR", "Failed to morph text", 502);
      }

      // 6. Stream the response directly to the client
      const stream = pythonRes.body;
      if (!stream) {
        throw createApiError("WORKER_ERROR", "Worker returned empty body", 502);
      }

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    });
  });
}
