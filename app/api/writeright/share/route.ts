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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_TTL_SECS = 7 * 24 * 60 * 60;

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

export async function POST(req: Request) {
  return withSpan("api.writeright.share.create", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }

    addSpanAttributes({ "user.id": userId });

    let body: { chatId?: string; jobId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
    }

    const chatId = body.chatId?.trim() ?? "";
    const jobId = body.jobId?.trim() ?? "";

    if (!UUID_RE.test(chatId)) {
      return NextResponse.json({ error: "Invalid chatId", code: "INVALID_CHAT_ID" }, { status: 400 });
    }
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: "Invalid jobId", code: "INVALID_JOB_ID" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobError } = await supabase
      .from("writeright_ai_jobs")
      .select("id, chat_id, user_id")
      .eq("id", jobId)
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + SHARE_TTL_SECS;
    const secret = process.env.WRITERIGHT_SHARE_JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("[api.writeright.share] Missing share token secret", traceLogFields());
      return NextResponse.json({ error: "Server misconfigured", code: "MISSING_SECRET" }, { status: 500 });
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
      return NextResponse.json({ error: "Failed to create share link", code: "DB_ERROR" }, { status: 500 });
    }

    addSpanEvent("writeright.share.created", { chat_id: chatId, job_id: jobId });
    addSpanAttributes({ "writeright.chat_id": chatId, "writeright.job_id": jobId });

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://brainmateai.com";
    const shareUrl = `${appBaseUrl.replace(/\/+$/, "")}/share/${token}`;

    return NextResponse.json({ shareUrl, expiresAt: expiresAtIso }, { status: 201 });
  });
}
