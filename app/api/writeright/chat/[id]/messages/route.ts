// app/api/writeright/chat/[id]/messages/route.ts — Fetch messages for a chat
//
// GET — Returns all messages ordered by created_at ASC

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/writeright/chat/[id]/messages — Fetch all messages
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // BUG-07 FIX: wrapped in withErrorHandler — unhandled exceptions now return
  // structured JSON instead of leaking raw Node.js error objects to the client.
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.messages.list", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: chatId } = await params;

      if (!UUID_RE.test(chatId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid chat ID", 400);
      }

      addSpanAttributes({
        "user.id": userId,
        "writeright.chat_id": chatId,
      });

      const supabase = getSupabaseAdmin();
      const { searchParams } = new URL(req.url);
      const includeCompare = searchParams.get("compare") === "true";

      // Verify chat is not deleted and belongs to this user before fetching messages
      const { data: chat, error: chatError } = await supabase
        .from("writeright_chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (chatError || !chat) {
        throw createApiError("NOT_FOUND", "Chat not found", 404);
      }

      const { data: messages, error } = await supabase
        .from("writeright_messages")
        .select("id, chat_id, user_id, role, content, metadata, created_at")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[api.writeright.messages] List failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to fetch messages", 500);
      }

      const rows = messages ?? [];
      let jobsByMessageId = new Map<string, unknown>();

      if (includeCompare) {
        const assistantJobIds = rows
          .map((row) => {
            const metadata = (row.metadata ?? {}) as Record<string, unknown>;
            return typeof metadata.job_id === "string" && metadata.job_id !== "cached"
              ? metadata.job_id
              : null;
          })
          .filter((jobId): jobId is string => Boolean(jobId));

        if (assistantJobIds.length > 0) {
          const { data: jobs, error: jobsError } = await supabase
            .from("writeright_ai_jobs")
            .select("id, output, status")
            .eq("user_id", userId)
            .in("id", assistantJobIds);
          if (jobsError) throw createApiError("DB_ERROR", "Failed to fetch message scores", 500);
          jobsByMessageId = new Map((jobs ?? []).map((job) => [job.id, job.output as unknown]));
        }
      }

      const normalized = rows.map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const jobId = typeof metadata.job_id === "string" ? metadata.job_id : null;
        return {
          ...row,
          metadata: {
            ...metadata,
            input_hash: typeof metadata.input_hash === "string" ? metadata.input_hash : null,
            original_text: typeof metadata.original_text === "string" ? metadata.original_text : null,
          },
          scores: includeCompare && jobId
            ? ((jobsByMessageId.get(jobId) as { scores?: unknown } | undefined)?.scores ?? null)
            : undefined,
        };
      });

      addSpanAttributes({ "writeright.message_count": normalized.length });

      return NextResponse.json({ messages: normalized });
    });
  });
}
