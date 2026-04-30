// FILE: app/api/writeright/export/route.ts — WriteRight data export

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { checkRateLimit } from "@/lib/writeright-queue";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { ExportSchema } from "@/lib/writeright-validators";

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("writeright.export", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Unauthorized", 401);
      }
      addSpanAttributes({ "user.id": userId });

      try {
        const { allowed } = await checkRateLimit(userId + ':export', 5);
        if (!allowed) {
          throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429, {
            headers: { 'Retry-After': '60' }
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "WriteRightError") throw err;
      }

      const { searchParams } = new URL(req.url);
      const queryParams = {
        format: searchParams.get("format") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      };

      const parsed = ExportSchema.safeParse(queryParams);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid query parameters", 400, { issues: parsed.error.issues });
      }

      const { from: fromDate, to: toDate, format } = parsed.data;

      const supabase = getSupabaseAdmin();
      let query = supabase
        .from("writeright_messages")
        .select("id, chat_id, role, content, metadata, created_at, writeright_chats(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (fromDate) {
        query = query.gte("created_at", new Date(fromDate).toISOString());
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      const { data: messages, error } = await query;
      if (error) {
        console.error("[api.writeright.export] DB Error:", { error: error.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to load history", 500);
      }

      const chatsMap: Record<string, { title: string, messages: { role: string, content: string, timestamp: string, metadata: unknown }[] }> = {};
      messages.forEach((msg) => {
        if (!chatsMap[msg.chat_id]) {
          const chatTitles = msg.writeright_chats;
          const chatTitle = Array.isArray(chatTitles) ? chatTitles[0]?.title : (chatTitles as { title?: string })?.title;
          chatsMap[msg.chat_id] = {
            title: chatTitle || "Untitled Document",
            messages: [],
          };
        }
        chatsMap[msg.chat_id].messages.push({
          role: msg.role,
          content: msg.content,
          timestamp: msg.created_at,
          metadata: msg.metadata as Record<string, unknown>,
        });
      });


      const grouped = Object.values(chatsMap);

      if (format === "markdown") {
        const lines: string[] = [
          "# WriteRight Export",
          `_Exported on ${new Date().toLocaleDateString()}_`,
          "",
        ];
        for (const chat of grouped) {
          lines.push(`## ${chat.title}`);
          lines.push(`_Mode: ${((chat.messages?.[0]?.metadata as Record<string, unknown>)?.mode as string) || "email"} · ${chat.messages.length} exchanges_`);
          lines.push("");
          for (const msg of chat.messages) {
            if (msg.role === "user") {
              lines.push(`**You:** ${msg.content}`);
            } else {
              let result: Record<string, unknown> = { improved_text: msg.content, scores: null };
              try {
                result = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              } catch(e) {}
              lines.push(`**WriteRight:** ${result.improved_text || msg.content}`);
              if (result.scores) {
                lines.push(`> Clarity ${result.scores.clarity}/10 · Tone ${result.scores.tone}/10 · Impact ${result.scores.impact}/10`);
              }
            }
            lines.push("");
          }
          lines.push("---");
          lines.push("");
        }
        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="writeright-export-${Date.now()}.md"`,
          },
        });
      }

      const exportManifest = {
        user: userId,
        generated_at: new Date().toISOString(),
        format,
        chats: grouped,
      };

      return NextResponse.json(exportManifest, { status: 200 });
    });
  });
}

// END FILE: app/api/writeright/export/route.ts
