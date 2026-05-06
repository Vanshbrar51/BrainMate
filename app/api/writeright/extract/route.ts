// app/api/writeright/extract/route.ts — File text extraction for WriteRight
//
// POST — Accepts TXT / PDF / DOCX and returns extracted text (max 10k chars).
// BUG-01 FIX: PDFParse is a CLASS (named export) that takes {data, verbosity}
// in the constructor, not a default-exported function. This version (pdf-parse v3+)
// uses `new PDFParse({ data: Buffer, verbosity: -1 })` and `.getText()`.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
// BUG-01 FIX: named import — pdf-parse exports { PDFParse } class, not a default fn
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError, WriteRightError } from "@/lib/writeright-errors";

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
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.extract.post", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      try {
        const rate = await checkExtractRateLimit(userId);
        addSpanAttributes({ "writeright.extract.remaining": rate.remaining });
        if (!rate.allowed) {
          addSpanEvent("writeright.extract.rate_limited", {});
          throw createApiError("RATE_LIMITED", "Extraction rate limit exceeded", 429, {
            headers: { "Retry-After": "3600" },
          });
        }
      } catch (err) {
        if (err instanceof WriteRightError) throw err;
        console.error("[api.writeright.extract] Rate-limit check failed", {
          error: err instanceof Error ? err.message : String(err),
          ...traceLogFields(),
        });
      }

      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        throw createApiError("INVALID_BODY", "Invalid form data", 400);
      }

      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw createApiError("INVALID_BODY", "Missing file", 400);
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        throw createApiError("VALIDATION_ERROR", "Unsupported file type", 400);
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw createApiError("VALIDATION_ERROR", "File exceeds 4MB limit", 413);
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
          realType = "text/plain";
        }
      }

      if (!ALLOWED_TYPES.has(realType)) {
        throw createApiError("VALIDATION_ERROR", "Unsupported file type", 400);
      }

      if (realType === "text/plain") {
        extracted = sanitizeExtractedText(bytes.toString("utf-8"));
      } else if (realType === "application/pdf") {
        // BUG-01 FIX: PDFParse is a class — new PDFParse({ data, verbosity }) + .getText()
        try {
          const parser = new PDFParse({ data: bytes, verbosity: -1 });
          const text = await parser.getText();
          extracted = sanitizeExtractedText(typeof text === "string" ? text : "");
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
        throw createApiError(
          "VALIDATION_ERROR",
          "Could not read this file. Paste the text manually.",
          422,
        );
      }

      const truncated = extracted.length > MAX_CHARS;
      const text = extracted.slice(0, MAX_CHARS);

      addSpanAttributes({
        "writeright.extract.char_count": text.length,
        "writeright.extract.truncated": truncated,
        "writeright.extract.file_type": realType,
      });

      return NextResponse.json({
        text,
        truncated,
        char_count: text.length,
      });
    });
  });
}
