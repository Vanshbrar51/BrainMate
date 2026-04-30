import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function checkPublicShareRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  if (isCircuitOpen()) return { allowed: true, remaining: 60 };
  const redis = getRedisPool();
  const key = ns("writeright", "public_share_ratelimit", ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return { allowed: count <= 60, remaining: Math.max(0, 60 - count) };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.public.share.get", async () => {
      const { token } = await params;
      const ip = req.headers.get("x-forwarded-for") || "unknown";

      const rate = await checkPublicShareRateLimit(ip);
      if (!rate.allowed) {
        throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429, {
          headers: { "Retry-After": "60" }
        });
      }

      if (!token || token.split(".").length !== 3) {
        throw createApiError("INVALID_TOKEN", "Invalid token format", 400);
      }

      const [headerB64, payloadB64, signatureB64] = token.split(".");
      const secret = process.env.WRITERIGHT_SHARE_JWT_SECRET || process.env.NEXTAUTH_SECRET;

      if (!secret) {
        console.error("[api.writeright.public.share] Missing share token secret", traceLogFields());
        throw createApiError("MISSING_SECRET", "Server misconfigured", 500);
      }

      const data = `${headerB64}.${payloadB64}`;
      const expectedSignature = createHmac("sha256", secret).update(data).digest();
      const expectedSignatureB64 = base64Url(expectedSignature);

      // Constant-time comparison
      const sig1 = Buffer.from(signatureB64);
      const sig2 = Buffer.from(expectedSignatureB64);

      if (sig1.length !== sig2.length || !timingSafeEqual(sig1, sig2)) {
        throw createApiError("INVALID_TOKEN", "Invalid token signature", 401);
      }

      const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw createApiError("EXPIRED_TOKEN", "Token has expired", 410);
      }

      const supabase = getSupabaseAdmin();

      const { data: shareData, error } = await supabase
        .from("writeright_public_shares")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !shareData) {
        throw createApiError("NOT_FOUND", "Share link not found or expired", 404);
      }

      const { data: shareLink } = await supabase.from("writeright_shares").select("job_id, chat_id").eq("token", token).single();

      if (!shareLink) {
          throw createApiError("NOT_FOUND", "Share link not found or expired", 404);
      }

      const { data: job } = await supabase.from("writeright_ai_jobs").select("input_hash, metadata, message_id").eq("id", shareLink.job_id).single();

      let beforeText = "";
      if (job && job.message_id) {
          const { data: msg } = await supabase.from("writeright_messages").select("content").eq("id", job.message_id).single();
          if (msg) beforeText = msg.content;
      }

      addSpanAttributes({ "writeright.share.token": token });

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://brainmateai.com";

      return NextResponse.json({
        before: beforeText,
        after: shareData.after_text,
        mode: shareData.mode,
        tone: shareData.tone,
        scores: shareData.scores,
        created_at: shareData.created_at,
        expires_at: shareData.expires_at,
        branding: {
          app_name: "WriteRight",
          app_url: appBaseUrl,
        }
      });
    });
  });
}
