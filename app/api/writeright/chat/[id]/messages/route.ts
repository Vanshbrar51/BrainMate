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

      // Fetch messages ordered by created_at ascending
      const { data: messages, error } = await supabase
        .from("writeright_messages")
        .select("id, chat_id, user_id, role, content, metadata, created_at")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[api.writeright.messages] List failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to fetch messages", 500);
      }

      addSpanAttributes({ "writeright.message_count": messages?.length ?? 0 });

      return NextResponse.json({ messages: messages ?? [] });
    });
  });
}
