import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_CHARS = 10_000;
const ALLOWED_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function extractRateKey(userId: string): string {
  return ns("writeright", "extract", "ratelimit", userId);
}

function sanitizeExtractedText(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

async function checkExtractRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (isCircuitOpen()) return { allowed: true, remaining: 20 };
  const redis = getRedisPool();
  const key = extractRateKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 3600);
  }
  const allowed = count <= 20;
  return { allowed, remaining: Math.max(0, 20 - count) };
}



function extractPdfFallback(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const matches = raw.match(/\(([^()]{2,500})\)\s*T[Jj]/g) ?? [];
  const extracted = matches
    .map((segment) => segment.replace(/\)\s*T[Jj]$/, "").replace(/^\(/, ""))
    .join(" ");
  return sanitizeExtractedText(extracted);
}

export async function POST(req: Request) {
  return withSpan("api.writeright.extract.post", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }
    addSpanAttributes({ "user.id": userId });

    try {
      const rate = await checkExtractRateLimit(userId);
      addSpanAttributes({ "writeright.extract.remaining": rate.remaining });
      if (!rate.allowed) {
        addSpanEvent("writeright.extract.rate_limited", {});
        return NextResponse.json(
          { error: "Extraction rate limit exceeded", code: "RATE_LIMITED", retryAfter: 3600 },
          { status: 429, headers: { "Retry-After": "3600" } },
        );
      }
    } catch (err) {
      console.error("[api.writeright.extract] Rate-limit check failed", {
        error: err instanceof Error ? err.message : String(err),
        ...traceLogFields(),
      });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data", code: "INVALID_BODY" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file", code: "MISSING_FILE" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type", code: "UNSUPPORTED_TYPE" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File exceeds 4MB limit", code: "FILE_TOO_LARGE" }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let extracted = "";

    let realType = file.type || "unknown";
    if (bytes.length >= 4) {
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        realType = "application/pdf";
      } else if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
        realType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else {
        // Assume text
        realType = "text/plain";
      }
    }

    if (!ALLOWED_TYPES.has(realType)) {
      return NextResponse.json({ error: "Unsupported file type", code: "UNSUPPORTED_TYPE" }, { status: 400 });
    }

    if (realType === "text/plain") {
      extracted = sanitizeExtractedText(bytes.toString("utf-8"));
    } else if (realType === "application/pdf") {
      try {
        const parser = new PDFParse({ data: bytes });
        const data = await parser.getText();
        extracted = sanitizeExtractedText(data.text);
      } catch {
        extracted = extractPdfFallback(bytes);
      }
    } else {
      try {
        const { value } = await mammoth.extractRawText({ buffer: bytes });
        extracted = sanitizeExtractedText(value);
      } catch {
        extracted = "";
      }
    }

    if (!extracted) {
      return NextResponse.json(
        { error: "Could not read this file. Paste the text manually.", code: "EXTRACTION_FAILED" },
        { status: 422 },
      );
    }

    const truncated = extracted.length > MAX_CHARS;
    const text = extracted.slice(0, MAX_CHARS);

    return NextResponse.json({
      text,
      truncated,
      char_count: text.length,
    });
  });
}
