// FILE: app/api/writeright/rephrases/route.ts
// POST — Instant rephrase endpoint (direct AI call, not via Redis queue)

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes } from "@/lib/tracing";

const MAX_INPUT_CHARS = 500;
const RATE_LIMIT_WINDOW = 600; // 10 minutes in seconds
const RATE_LIMIT_MAX = 30;

const RephraseSchema = z.object({
  text: z.string().min(1).max(MAX_INPUT_CHARS),
  style: z.enum(['shorter', 'longer', 'simpler', 'stronger', 'formal', 'casual']),
});

export async function POST(req: Request) {
  return withErrorHandler(req, async () =>
    withSpan("api.writeright.rephrases.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const parsed = RephraseSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input", 400);
      }

      const { text, style } = parsed.data;

      // Rate limit: 30 calls per 10 minutes per user
      if (!isCircuitOpen()) {
        try {
          const redis = getRedisPool();
          const rlKey = ns("writeright", "rephrase-rl", userId);
          const count = await redis.incr(rlKey);
          if (count === 1) {
            await redis.expire(rlKey, RATE_LIMIT_WINDOW);
          }
          if (count > RATE_LIMIT_MAX) {
            throw createApiError("RATE_LIMITED", "Rephrase rate limit exceeded. Try again in 10 minutes.", 429, {
              headers: { "Retry-After": String(RATE_LIMIT_WINDOW) },
            });
          }
        } catch (err) {
          if ((err as { code?: string }).code === "RATE_LIMITED") throw err;
          // Redis error — allow through gracefully
        }
      }

      // Call Python worker /morph endpoint directly
      const workerUrl = process.env.PYTHON_WORKER_URL ?? "http://127.0.0.1:8000";

      let workerRes: Response;
      try {
        workerRes = await fetch(`${workerUrl}/morph`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, style, mode: "rephrase" }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw createApiError("GATEWAY_OFFLINE", "AI worker is unavailable. Please try again.", 503);
      }

      if (!workerRes.ok) {
        throw createApiError("GATEWAY_OFFLINE", "AI rephrase failed. Please try again.", 503);
      }

      let result: unknown;
      try {
        result = await workerRes.json();
      } catch {
        throw createApiError("GATEWAY_OFFLINE", "Invalid response from AI worker.", 503);
      }

      const rephraseResult = result as { rephrases?: string[] };
      const rephrases = Array.isArray(rephraseResult?.rephrases) ? rephraseResult.rephrases.slice(0, 3) : [];

      return NextResponse.json({ rephrases });
    })
  );
}
