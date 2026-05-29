import { logError, logEvent } from "@/lib/writeright-logger";
// app/api/writeright/voice/route.ts — Brand Voice example ingestion + Audio STT
//
// GET  — List brand voice examples (proxied to Python worker)
// POST — Multipart audio → STT transcript  OR  JSON text → brand voice ingestion

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { withSpan, addSpanAttributes, injectTraceContext } from "@/lib/tracing";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import { getPreferredInternalApiToken } from "@/lib/internal-api-token";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://127.0.0.1:8000";
const AUDIO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AUDIO_RATE_LIMIT = 10; // 10/min — STT is expensive

async function checkAudioRateLimit(userId: string): Promise<boolean> {
  if (isCircuitOpen()) return true;
  try {
    const redis = getRedisPool();
    const key = ns("writeright", "voice", "ratelimit", userId);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= AUDIO_RATE_LIMIT;
  } catch {
    return true; // non-fatal — allow on Redis failure
  }
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.voice.list", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      addSpanAttributes({ "user.id": userId });

      const traceHeaders = injectTraceContext(new Headers());
      const res = await fetch(`${PYTHON_WORKER_URL}/voice/examples?user_id=${userId}`, {
        headers: {
          "X-Internal-API-Token": await getPreferredInternalApiToken(),
          ...traceHeaders,
        },
      });

      if (!res.ok) throw createApiError("WORKER_ERROR", "Failed to fetch examples", 502);

      const data = await res.json();
      return NextResponse.json(data);
    });
  });
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.voice.ingest", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const contentType = req.headers.get("content-type") ?? "";

      // ── Audio STT path (multipart/form-data) ──────────────────────────────
      if (contentType.includes("multipart/form-data")) {
        addSpanAttributes({ "user.id": userId, "writeright.voice.path": "stt" });

        const allowed = await checkAudioRateLimit(userId);
        if (!allowed) {
          throw createApiError("RATE_LIMITED", "Rate limit exceeded", 429, {
            headers: {
              "X-RateLimit-Limit": String(AUDIO_RATE_LIMIT),
              "X-RateLimit-Remaining": "0",
              "Retry-After": "60",
            },
          });
        }

        const form = await req.formData().catch(() => {
          throw createApiError("INVALID_BODY", "Invalid form data", 400);
        });
        const audio = form.get("audio");
        const lang = form.get("lang");

        if (!(audio instanceof File)) {
          throw createApiError("VALIDATION_ERROR", "Audio file is required", 400);
        }
        if (audio.size > AUDIO_MAX_BYTES) {
          throw createApiError("FILE_TOO_LARGE", "File exceeds the 5MB limit.", 413, {
            max_bytes: AUDIO_MAX_BYTES,
          });
        }

        addSpanAttributes({ "writeright.voice.audio_bytes": audio.size });

        // If no STT provider configured, signal frontend to fall back to browser STT
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (!deepgramKey) {
          return NextResponse.json({
            transcript: null,
            confidence: 0,
            language_detected: typeof lang === "string" ? lang : "auto",
            fallback: "browser",
          });
        }

        const sttRes = await fetch(
          `https://api.deepgram.com/v1/listen?language=${encodeURIComponent(typeof lang === "string" ? lang : "en")}`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${deepgramKey}`,
              "Content-Type": audio.type || "audio/webm",
            },
            body: Buffer.from(await audio.arrayBuffer()),
          },
        );

        // STT provider failure → graceful browser fallback, never crash
        if (!sttRes.ok) {
          return NextResponse.json({
            transcript: null,
            confidence: 0,
            language_detected: typeof lang === "string" ? lang : "auto",
            fallback: "browser",
          });
        }

        const data = await sttRes.json() as {
          results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
          metadata?: { language?: string };
        };
        const alt = data.results?.channels?.[0]?.alternatives?.[0];

        return NextResponse.json({
          transcript: alt?.transcript ?? "",
          confidence: alt?.confidence ?? 0,
          language_detected: data.metadata?.language ?? (typeof lang === "string" ? lang : "auto"),
        });
      }

      // ── Brand Voice ingestion path (JSON) ────────────────────────────────
      addSpanAttributes({ "user.id": userId, "writeright.voice.path": "ingestion" });

      let body;
      try {
        body = await req.json();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid JSON body", 400);
      }

      const { content } = body as { content?: unknown };
      if (!content || typeof content !== "string" || content.length < 20) {
        throw createApiError("VALIDATION_ERROR", "Example text must be at least 20 characters.", 400);
      }

      addSpanAttributes({ "writeright.voice.length": content.length });

      const traceHeaders = injectTraceContext(new Headers());
      const res = await fetch(`${PYTHON_WORKER_URL}/voice/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Token": await getPreferredInternalApiToken(),
          ...traceHeaders,
        },
        body: JSON.stringify({ user_id: userId, content }),
      });

      if (!res.ok) {
        const err = await res.text();
        logError("[api.writeright.voice] Ingestion failed:", err);
        throw createApiError("WORKER_ERROR", "Failed to process style example", 502);
      }

      const result = await res.json();
      return NextResponse.json(result);
    });
  });
}
