import { NextResponse } from "next/server";
import { withSpan, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function calculateFleschKincaid(text: string) {
  if (!text.trim()) return { score: 0, label: "Empty", grade_level: 0, avg_sentence_length: 0 };

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const wordsArray = text.split(/\s+/).filter(w => w.trim().length > 0);
  const words = wordsArray.length || 1;

  let syllables = 0;
  for (const word of wordsArray) {
    syllables += countSyllables(word);
  }

  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  const gradeLevel = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;

  let label = "Standard";
  if (score >= 90) label = "Very Easy";
  else if (score >= 80) label = "Easy";
  else if (score >= 70) label = "Fairly Easy";
  else if (score >= 60) label = "Standard";
  else if (score >= 50) label = "Fairly Difficult";
  else if (score >= 30) label = "Difficult";
  else label = "Very Confusing";

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    label,
    grade_level: Math.round(Math.max(0, gradeLevel) * 10) / 10,
    avg_sentence_length: Math.round((words / sentences) * 10) / 10
  };
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.readability", async () => {
      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      if (typeof body.text !== "string") {
        throw createApiError("VALIDATION_ERROR", "Text is required", 400);
      }

      const text = body.text.slice(0, 10000); // Max 10k chars
      const result = calculateFleschKincaid(text);

      return NextResponse.json(result);
    });
  });
}
