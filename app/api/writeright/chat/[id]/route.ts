// app/api/writeright/chat/[id]/route.ts — Single chat operations
//
// GET    — Get a single chat with message count
// DELETE — Hard delete a chat (cascades to messages and jobs)

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(id: string): boolean {
  return UUID_RE.test(id);
}

// ---------------------------------------------------------------------------
// GET /api/writeright/chat/[id] — Get single chat
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSpan("api.writeright.chat.get", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { id: chatId } = await params;

    if (!validateUuid(chatId)) {
      return NextResponse.json(
        { error: "Invalid chat ID", code: "INVALID_ID" },
        { status: 400 },
      );
    }

    addSpanAttributes({
      "user.id": userId,
      "writeright.chat_id": chatId,
    });

    const supabase = getSupabaseAdmin();

    const { data: chat, error } = await supabase
      .from("writeright_chats")
      .select("id, user_id, title, mode, metadata, created_at, updated_at, writeright_messages(count)")
      .eq("id", chatId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .single();

    if (error || !chat) {
      if (error?.code === "PGRST116") {
        return NextResponse.json(
          { error: "Chat not found", code: "NOT_FOUND" },
          { status: 404 },
        );
      }
      console.error("[api.writeright.chat] Get failed:", {
        error: error?.message,
        ...traceLogFields(),
      });
      return NextResponse.json(
        { error: "Failed to get chat", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    const result = {
      id: chat.id,
      user_id: chat.user_id,
      title: chat.title,
      mode: chat.mode,
      metadata: chat.metadata,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      message_count:
        Array.isArray(chat.writeright_messages) && chat.writeright_messages.length > 0
          ? (chat.writeright_messages[0] as { count: number }).count
          : 0,
    };

    return NextResponse.json({ chat: result });
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/writeright/chat/[id] — Hard delete chat (cascades)
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSpan("api.writeright.chat.delete", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { id: chatId } = await params;

    if (!validateUuid(chatId)) {
      return NextResponse.json(
        { error: "Invalid chat ID", code: "INVALID_ID" },
        { status: 400 },
      );
    }

    addSpanAttributes({
      "user.id": userId,
      "writeright.chat_id": chatId,
    });

    const supabase = getSupabaseAdmin();

    // Hard delete — ON DELETE CASCADE will clean up messages and jobs
    const { error, count } = await supabase
      .from("writeright_chats")
      .delete({ count: "exact" })
      .eq("id", chatId)
      .eq("user_id", userId);

    if (error) {
      console.error("[api.writeright.chat] Delete failed:", {
        error: error.message,
        ...traceLogFields(),
      });
      return NextResponse.json(
        { error: "Failed to delete chat", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "Chat not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    addSpanEvent("chat.deleted", { chat_id: chatId });

    return NextResponse.json({ ok: true });
  });
}
