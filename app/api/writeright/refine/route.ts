import { auth } from "@clerk/nextjs/server";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan } from "@/lib/tracing";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.refine.post", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const { fullText, selectedText, prompt, mode, tone } = body;

      if (!fullText || !selectedText || !prompt) {
        throw createApiError("VALIDATION_ERROR", "Missing required fields", 400);
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a precise writing assistant. Your task is to rewrite a SPECIFIC segment of a larger text based on a user's instruction.
            
CONTEXT:
Full text: "${fullText}"
Segment to rewrite: "${selectedText}"
Writing Mode: ${mode}
Active Tone: ${tone}

USER INSTRUCTION:
"${prompt}"

RULES:
1. ONLY return the rewritten segment. No explanations, no quotes, no preamble.
2. Ensure the rewritten segment fits perfectly back into the original text's grammar and flow.
3. Preserve the core meaning unless the instruction explicitly asks to change it.
4. Keep the length similar unless the instruction asks otherwise.`
          }
        ],
        temperature: 0.7,
      });

      const refinedText = completion.choices[0].message.content?.trim() || selectedText;

      return Response.json({ refinedText });
    });
  });
}
