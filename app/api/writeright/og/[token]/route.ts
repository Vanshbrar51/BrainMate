import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function verifyToken(token: string): void {
  const secret =
    process.env.WRITERIGHT_SHARE_SECRET ||
    process.env.WRITERIGHT_SHARE_JWT_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!secret) throw createApiError("MISSING_SECRET", "Share feature unavailable", 503);

  const parts = token.split(".");
  if (parts.length !== 3) throw createApiError("INVALID_TOKEN", "Invalid share link", 400);
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const safe = signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!safe) throw createApiError("INVALID_TOKEN", "Invalid share link", 400);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.og.get", async () => {
      await auth().catch(() => null);
      const { token } = await params;
      verifyToken(token);

      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("writeright_public_shares")
        .select("scores")
        .eq("token", token)
        .maybeSingle();

      const scores = data?.scores && typeof data.scores === "object"
        ? data.scores as { clarity?: unknown; tone?: unknown; impact?: unknown }
        : {};
      const after = [scores.clarity, scores.tone, scores.impact]
        .reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
      const before = Math.max(0, after - 6);
      const title = `My writing score jumped from ${before} to ${after}`;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#101820"/>
  <rect x="72" y="72" width="1056" height="486" rx="28" fill="#f7f3e8"/>
  <text x="120" y="168" font-family="Arial, sans-serif" font-size="34" fill="#101820">BrainMate AI • WriteRight</text>
  <text x="120" y="282" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#101820">${escapeXml(title)}</text>
  <text x="120" y="382" font-family="Arial, sans-serif" font-size="34" fill="#335c67">Clearer, sharper, more confident writing.</text>
  <rect x="120" y="438" width="204" height="64" rx="12" fill="#e09f3e"/>
  <text x="152" y="481" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#101820">Try it free</text>
</svg>`;

      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    });
  });
}
