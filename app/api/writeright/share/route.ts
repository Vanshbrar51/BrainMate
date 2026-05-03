// app/api/writeright/share/route.ts — WriteRight public share link generation
//
// POST — Create a time-limited share link for a completed job result.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { ShareSchema } from "@/lib/writeright-validators";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHARE_TTL_SECS = 7 * 24 * 60 * 60; // 7 days

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createShareToken(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" } as const;
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(data).digest();
  return `${data}.${base64Url(signature)}`;
}

// ---------------------------------------------------------------------------
// POST /api/writeright/share
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.share.create", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = ShareSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, {
          issues: parsed.error.issues,
        });
      }

      const { chatId, jobId } = parsed.data;

      const supabase = getSupabaseAdmin();

      const { data: job, error: jobError } = await supabase
        .from("writeright_ai_jobs")
        .select("id, chat_id, user_id, status")
        .eq("id", jobId)
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (jobError || !job) {
        throw createApiError("NOT_FOUND", "Job not found", 404);
      }

      if (job.status !== "completed") {
        throw createApiError(
          "VALIDATION_ERROR",
          "Can only share completed jobs",
          400,
        );
      }

      const now = Math.floor(Date.now() / 1000);
      const exp = now + SHARE_TTL_SECS;
      const secret =
        process.env.WRITERIGHT_SHARE_JWT_SECRET ||
        process.env.NEXTAUTH_SECRET;

      if (!secret) {
        console.error("[api.writeright.share] Missing share token secret", traceLogFields());
        throw createApiError(
          "INTERNAL_ERROR",
          "Server misconfigured — missing secret",
          500,
        );
      }

      const token = createShareToken(
        {
          sub: userId,
          chat_id: chatId,
          job_id: jobId,
          iat: now,
          exp,
          jti: randomUUID(),
        },
        secret,
      );

      const expiresAtIso = new Date(exp * 1000).toISOString();

      const { error: insertError } = await supabase.from("writeright_shares").insert({
        user_id: userId,
        chat_id: chatId,
        job_id: jobId,
        token,
        expires_at: expiresAtIso,
        metadata: { source: "writeright_share_modal" },
      });

      if (insertError) {
        console.error("[api.writeright.share] Insert failed", {
          error: insertError.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to create share link", 500);
      }

      addSpanEvent("writeright.share.created", { chat_id: chatId, job_id: jobId });
      addSpanAttributes({
        "writeright.chat_id": chatId,
        "writeright.job_id": jobId,
      });

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://brainmateai.com";
      const shareUrl = `${appBaseUrl.replace(/\/+$/, "")}/share/${token}`;

      return NextResponse.json({ shareUrl, expiresAt: expiresAtIso }, { status: 201 });
    });
  });
}
