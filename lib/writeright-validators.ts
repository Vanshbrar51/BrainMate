// FILE: lib/writeright-validators.ts — Zod schemas for request validation

import { z } from "zod";

export const CreateChatSchema = z.object({
  title: z.string().max(200).optional(),
  mode: z.enum(["email", "paragraph", "linkedin", "whatsapp"]).optional()
});

export const MessageSchema = z.object({
  chatId: z.string().uuid(),
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
  tone: z.enum(["Professional", "Friendly", "Concise", "Academic", "Assertive"]),
  mode: z.enum(["email", "paragraph", "linkedin", "whatsapp"]),
  output_language: z.enum(["en", "hindi", "tamil", "marathi", "bengali", "telugu"]).optional().default("en"),
  intensity: z.number().int().min(1).max(5).optional().default(3)
});

export const FeedbackSchema = z.object({
  jobId: z.string().uuid(),
  chatId: z.string().uuid(),
  rating: z.enum(["up", "down"]),
  reason: z.string().max(1000).optional(),
  mode: z.string().optional(),
  tone: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const SearchSchema = z.object({
  query: z.string().min(1, "Query is required").max(100, "Query is too long")
});

export const ExportSchema = z.object({
  format: z.enum(["json", "txt", "markdown"]).optional().default("json"),
  from: z.string().optional(),
  to: z.string().optional()
});

// END FILE: lib/writeright-validators.ts
