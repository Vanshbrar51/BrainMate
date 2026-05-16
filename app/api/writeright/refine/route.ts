import { auth } from "@clerk/nextjs/server";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import OpenAI from "openai";
import { createHash } from "crypto";

const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
       throw new Error("Missing credentials. Please pass an apiKey or set OPENAI_API_KEY.");
    }
    return new OpenAI({ apiKey: "dummy-key-for-build" });
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

function cacheKey(selection: string, instruction: string): string {
  return ns(
    "writeright",
    "refine",
    createHash("sha256").update(`${selection}:${instruction}`).digest("hex"),
  );
}

async function checkRefineRateLimit(userId: string): Promise<boolean> {
  if (isCircuitOpen()) return true;
  const redis = getRedisPool();
  const key = ns("writeright", "refine", "ratelimit", userId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= 20;
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.refine.post", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      addSpanAttributes({ "user.id": userId });

      const allowed = await checkRefineRateLimit(userId);
      if (!allowed) {
        throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429, {
          headers: {
            "X-RateLimit-Limit": "20",
            "X-RateLimit-Remaining": "0",
            "Retry-After": "60",
          },
        });
      }

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const {
        text,
        selection,
        instruction,
        chatId,
        fullText,
        selectedText,
        prompt,
        mode,
        tone,
      } = body as {
        text?: unknown;
        selection?: unknown;
        instruction?: unknown;
        chatId?: unknown;
        fullText?: unknown;
        selectedText?: unknown;
        prompt?: unknown;
        mode?: unknown;
        tone?: unknown;
      };

      const sourceText = typeof text === "string" ? text : typeof fullText === "string" ? fullText : "";
      const selected = typeof selection === "string" ? selection : typeof selectedText === "string" ? selectedText : "";
      const userInstruction = typeof instruction === "string" ? instruction : typeof prompt === "string" ? prompt : "";

      if (!sourceText || !selected || !userInstruction) {
        throw createApiError("VALIDATION_ERROR", "Missing required fields", 400);
      }
      if (typeof chatId === "string") {
        const supabase = getSupabaseAdmin();
        const { data: chat } = await supabase
          .from("writeright_chats")
          .select("id")
          .eq("id", chatId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!chat) throw createApiError("NOT_FOUND", "Chat not found", 404);
      } else {
        getSupabaseAdmin();
      }

      const key = cacheKey(selected, userInstruction);
      if (!isCircuitOpen()) {
        const cached = await getRedisPool().get(key).catch(() => null);
        if (cached) return Response.json(JSON.parse(cached) as Record<string, unknown>);
      }

      const openai = getOpenAI();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a precise writing assistant. Your task is to rewrite a SPECIFIC segment of a larger text based on a user's instruction.
            
CONTEXT:
Full text: "${sourceText}"
Segment to rewrite: "${selected}"
Writing Mode: ${typeof mode === "string" ? mode : "paragraph"}
Active Tone: ${typeof tone === "string" ? tone : "Professional"}

USER INSTRUCTION:
"${userInstruction}"

RULES:
1. Return JSON with alternatives (3 strings) and explanation (one short sentence).
2. Ensure the rewritten segment fits perfectly back into the original text's grammar and flow.
3. Preserve the core meaning unless the instruction explicitly asks to change it.
4. Keep the length similar unless the instruction asks otherwise.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 100,
        temperature: 0.7,
      });

      const content = completion.choices[0].message.content?.trim() || "{}";
      let parsed: { alternatives?: unknown; explanation?: unknown } = {};
      try {
        parsed = JSON.parse(content) as { alternatives?: unknown; explanation?: unknown };
      } catch {
        parsed = { alternatives: [content], explanation: "Suggested replacement." };
      }
      const alternatives = Array.isArray(parsed.alternatives)
        ? parsed.alternatives.filter((item): item is string => typeof item === "string").slice(0, 3)
        : [selected];
      const result = {
        alternatives,
        explanation: typeof parsed.explanation === "string" ? parsed.explanation : "Suggested replacement.",
        refinedText: alternatives[0] ?? selected,
      };

      if (!isCircuitOpen()) {
        await getRedisPool().setex(key, 600, JSON.stringify(result)).catch(() => undefined);
      }

      return Response.json(result);
    });
  });
}
