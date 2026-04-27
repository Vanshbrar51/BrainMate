// FILE: app/api/writeright/chat/route.ts — Create and list WriteRight chats
//
// POST — Create a new chat session
// GET  — List all chats for the authenticated user

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { CreateChatSchema, ListChatsQuerySchema } from "@/lib/writeright-validators";

// ---------------------------------------------------------------------------
// POST /api/writeright/chat — Create a new chat
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.create", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = CreateChatSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      const { title: rawTitle, mode: rawMode } = parsed.data;

      const title = typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim().slice(0, 200)
        : "Untitled Chat";

      const mode = rawMode ?? "email";

      const supabase = getSupabaseAdmin();

      const { data: chat, error } = await supabase
        .from("writeright_chats")
        .insert({
          user_id: userId,
          title,
          mode,
        })
        .select("id, user_id, title, mode, created_at, updated_at")
        .single();

      if (error) {
        console.error("[api.writeright.chat] Insert failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to create chat", 500);
      }

      addSpanAttributes({ "writeright.chat_id": chat.id });
      addSpanEvent("chat.created", { chat_id: chat.id });

      return NextResponse.json({ chat }, { status: 201 });
    });
  });
}

// ---------------------------------------------------------------------------
// GET /api/writeright/chat — List all chats for user
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.chat.list", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      const { searchParams } = new URL(req.url);
      const parsedQuery = ListChatsQuerySchema.safeParse({
        page: searchParams.get("page") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      });
      if (!parsedQuery.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid query params", 400, {
          issues: parsedQuery.error.issues,
        });
      }

      const { page, limit } = parsedQuery.data;
      const offset = page * limit;
      const supabase = getSupabaseAdmin();

      const { data: chats, error } = await supabase
        .from("writeright_chats")
        .select("id, user_id, title, mode, created_at, updated_at, writeright_messages(count)")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("[api.writeright.chat] List failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to list chats", 500);
      }

      const transformed = (chats ?? []).map((chat) => ({
        id: chat.id,
        user_id: chat.user_id,
        title: chat.title,
        mode: chat.mode,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        message_count: (() => {
          const countData = chat.writeright_messages
          if (!Array.isArray(countData) || countData.length === 0) return 0
          const raw = (countData[0] as Record<string, unknown>).count
          const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
          return Number.isFinite(parsed) ? parsed : 0
        })(),
      }));

      addSpanAttributes({
        "writeright.chat_count": transformed.length,
        "writeright.chat_page": page,
        "writeright.chat_limit": limit,
      });

      return NextResponse.json({
        chats: transformed,
        page,
        limit,
      });
    });
  });
}
