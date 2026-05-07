// app/api/writeright/chat/[id]/route.ts — Single chat operations
//
// GET    — Get a single chat with message count
// DELETE — Soft delete a chat
// PATCH  — Rename a chat (F-BE-09)

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { TemplateRenameSchema } from "@/lib/writeright-validators";

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
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: chatId } = await params;

      if (!validateUuid(chatId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid chat ID", 400);
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
          throw createApiError("NOT_FOUND", "Chat not found", 404);
        }
        console.error("[api.writeright.chat] Get failed:", {
          error: error?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to get chat", 500);
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
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/writeright/chat/[id] — Soft delete chat
// ---------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.delete", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: chatId } = await params;

      if (!validateUuid(chatId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid chat ID", 400);
      }

      addSpanAttributes({
        "user.id": userId,
        "writeright.chat_id": chatId,
      });

      const supabase = getSupabaseAdmin();

      // Soft delete — set deleted_at to now
      const { error, data } = await supabase
        .from("writeright_chats")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .select("id");

      if (error) {
        console.error("[api.writeright.chat] Delete failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to delete chat", 500);
      }

      const count = data?.length || 0;
      if (count === 0) {
        throw createApiError("NOT_FOUND", "Chat not found or already deleted", 404);
      }

      addSpanEvent("chat.deleted", { chat_id: chatId });

      return NextResponse.json({ ok: true });
    });
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/writeright/chat/[id] — Rename chat (F-BE-09)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.patch", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: chatId } = await params;

      if (!validateUuid(chatId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid chat ID", 400);
      }

      addSpanAttributes({
        "user.id": userId,
        "writeright.chat_id": chatId,
      });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = TemplateRenameSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      const title = parsed.data.name.trim().slice(0, 200);

      const supabase = getSupabaseAdmin();

      const { data: chat, error } = await supabase
        .from("writeright_chats")
        .update({ title })
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .select("id, title, updated_at")
        .single();

      if (error || !chat) {
        if (error?.code === "PGRST116") {
          throw createApiError("NOT_FOUND", "Chat not found", 404);
        }
        console.error("[api.writeright.chat] Patch failed:", {
          error: error?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to rename chat", 500);
      }

      // Invalidate stats cache (title change can affect exports)
      if (!isCircuitOpen()) {
        try {
          await getRedisPool().del(ns("writeright", "stats", userId));
        } catch {
          // non-fatal
        }
      }

      addSpanEvent("chat.renamed", { chat_id: chatId });
      addSpanAttributes({ "writeright.chat_title_length": title.length });

      return NextResponse.json({ chat });
    });
  });
}
