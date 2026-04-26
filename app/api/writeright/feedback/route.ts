// FILE: app/api/writeright/feedback/route.ts — WriteRight feedback submission

import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { checkRateLimit } from "@/lib/writeright-queue";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { FeedbackSchema } from "@/lib/writeright-validators";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("writeright.feedback", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Unauthorized", 401);
      }
      addSpanAttributes({ "user.id": userId });

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = FeedbackSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      const { jobId, chatId, rating, reason, mode, tone, metadata } = parsed.data;

      try {
        const { allowed } = await checkRateLimit(userId, 30);
        if (!allowed) {
          throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "WriteRightError") throw err;
      }

      const supabase = getSupabaseAdmin();

      const { data: chat, error: chatError } = await supabase
        .from("writeright_chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (chatError || !chat) {
        throw createApiError("CHAT_NOT_FOUND", "Chat not found", 404);
      }

      const { error: fbError } = await supabase
        .from("writeright_feedback")
        .insert({
          user_id: userId,
          chat_id: chatId,
          job_id: jobId,
          rating,
          reason: reason || null,
          mode: mode || null,
          tone: tone || null,
          metadata: metadata || {},
        });

      if (fbError) {
        console.error("[api.writeright.feedback] failed:", { error: fbError.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to save feedback", 500);
      }

      return NextResponse.json({ success: true }, { status: 200 });
    });
  });
}

// END FILE: app/api/writeright/feedback/route.ts
