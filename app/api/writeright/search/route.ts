// FILE: app/api/writeright/search/route.ts — WriteRight global search

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
import { SearchSchema } from "@/lib/writeright-validators";

const SEARCH_LIMIT = 30;

function searchRateKey(userId: string): string {
  return ns("writeright", "search", "ratelimit", userId);
}

async function checkSearchRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (isCircuitOpen()) return { allowed: true, remaining: 60 };
  const redis = getRedisPool();
  const key = searchRateKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return { allowed: count <= 60, remaining: Math.max(0, 60 - count) };
}

function snippetForQuery(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return normalized.slice(0, 180);
  const start = Math.max(0, idx - 40);
  const end = Math.min(normalized.length, idx + q.length + 90);
  const snippet = normalized.slice(start, end);
  return `${start > 0 ? "…" : ""}${snippet}${end < normalized.length ? "…" : ""}`;
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.search.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      try {
        const rate = await checkSearchRateLimit(userId);
        addSpanAttributes({ "writeright.search.remaining": rate.remaining });
        if (!rate.allowed) {
          addSpanEvent("writeright.search.rate_limited", {});
          throw createApiError("RATE_LIMITED", "Search rate limit exceeded", 429, {
            headers: { "Retry-After": "60" }
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "WriteRightError") throw err;
        console.error("[api.writeright.search] Rate-limit check failed", {
          error: err instanceof Error ? err.message : String(err),
          ...traceLogFields(),
        });
      }

      const { searchParams } = new URL(req.url);
      const queryParams = { query: (searchParams.get("q") ?? "").trim() };
      if (!queryParams.query) {
        return NextResponse.json({ results: [] });
      }

      const parsed = SearchSchema.safeParse(queryParams);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid query", 400, { issues: parsed.error.issues });
      }
      const query = parsed.data.query;

      addSpanAttributes({ "writeright.search.length": query.length });

      const supabase = getSupabaseAdmin();
      const [titleMatchesRes, messageMatchesRes] = await Promise.all([
        supabase
          .from("writeright_chats")
          .select("id, title, mode, updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .textSearch("title", `'${query}'`, { type: 'websearch' })
          .order("updated_at", { ascending: false })
          .limit(SEARCH_LIMIT),
        supabase
          .from("writeright_messages")
          .select("chat_id, content, created_at")
          .eq("user_id", userId)
          .textSearch("content", `'${query}'`, { type: 'websearch' })
          .order("created_at", { ascending: false })
          .limit(SEARCH_LIMIT),
      ]);

      if (titleMatchesRes.error || messageMatchesRes.error) {
        console.error("[api.writeright.search] Query failed", {
          title_error: titleMatchesRes.error?.message,
          message_error: messageMatchesRes.error?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Search failed", 500);
      }

      const titleMatches = titleMatchesRes.data ?? [];
      const messageMatches = messageMatchesRes.data ?? [];

      const chatIdsFromMessages = Array.from(new Set(messageMatches.map((row) => row.chat_id).filter(Boolean)));
      const supplementalChats = chatIdsFromMessages.length
        ? await supabase
          .from("writeright_chats")
          .select("id, title, mode, updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .in("id", chatIdsFromMessages)
        : { data: [], error: null };

      if (supplementalChats.error) {
        console.error("[api.writeright.search] Supplemental chat lookup failed", {
          error: supplementalChats.error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Search failed", 500);
      }

      const chatMeta = new Map<string, { title: string; mode: string; updatedAt: string }>();
      for (const row of [...titleMatches, ...(supplementalChats.data ?? [])]) {
        chatMeta.set(row.id, {
          title: row.title ?? "Untitled Chat",
          mode: row.mode ?? "email",
          updatedAt: row.updated_at ?? new Date(0).toISOString(),
        });
      }

      const resultsByChatId = new Map<string, {
        chatId: string;
        chatTitle: string;
        messageSnippet: string;
        mode: string;
        updatedAt: string;
      }>();

      for (const row of messageMatches) {
        const chatId = row.chat_id;
        if (!chatId || resultsByChatId.has(chatId)) continue;
        const meta = chatMeta.get(chatId);
        if (!meta) continue;
        resultsByChatId.set(chatId, {
          chatId,
          chatTitle: meta.title,
          messageSnippet: snippetForQuery(row.content ?? "", query),
          mode: meta.mode,
          updatedAt: meta.updatedAt,
        });
      }

      for (const row of titleMatches) {
        if (resultsByChatId.has(row.id)) continue;
        resultsByChatId.set(row.id, {
          chatId: row.id,
          chatTitle: row.title ?? "Untitled Chat",
          messageSnippet: `Title matches "${query}"`,
          mode: row.mode ?? "email",
          updatedAt: row.updated_at ?? new Date(0).toISOString(),
        });
      }

      const results = Array.from(resultsByChatId.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, SEARCH_LIMIT);

      return NextResponse.json({ results });
    });
  });
}

// END FILE: app/api/writeright/search/route.ts
