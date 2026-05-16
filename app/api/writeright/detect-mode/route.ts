import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withSpan } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

type WritingMode = "email" | "linkedin" | "whatsapp" | "paragraph";

const SIGNALS: Record<WritingMode, RegExp[]> = {
  email: [/^(to|from|subject|cc|bcc)\s*:/im, /dear\s+\w/i, /regards,/i, /sincerely,/i],
  linkedin: [/#\w+/g, /excited to announce/i, /thrilled to share/i, /\bmy network\b/i],
  whatsapp: [/^(hi|hey|hello)[!?]?\s/i, /\bbtw\b/i, /\basap\b/i, /\bu there\b/i],
  paragraph: [],
};

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.detect_mode.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const body = await req.json().catch(() => {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }) as unknown;
      if (!body || typeof body !== "object" || typeof (body as { text?: unknown }).text !== "string") {
        throw createApiError("VALIDATION_ERROR", "Text is required", 400);
      }

      const text = (body as { text: string }).text.slice(0, 200);
      let detectedMode: WritingMode | null = null;
      let bestMatches = 0;

      for (const mode of ["email", "linkedin", "whatsapp"] as const) {
        const matches = SIGNALS[mode].filter((regex) => regex.test(text)).length;
        if (matches > bestMatches) {
          bestMatches = matches;
          detectedMode = mode;
        }
      }

      return NextResponse.json({
        detected_mode: bestMatches >= 2 ? detectedMode : null,
        confidence: Math.min(1, bestMatches / 4),
      });
    });
  });
}
