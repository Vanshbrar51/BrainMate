// FILE: lib/writeright-validators.ts — Zod schemas for WriteRight request validation
// ── CHANGED: [BE-2] Complete validation schemas ──

import { z } from "zod";

// ── CHANGED: [BE-2] MessageSchema with strict typing ──
export const MessageSchema = z.object({
  chatId: z.string().uuid("Chat ID must be a valid UUID"),
  text: z
    .string()
    .min(1, "Text is required")
    .max(10000, "Text is too long (max 10,000 characters)"),
  tone: z.enum(
    ["Professional", "Friendly", "Concise", "Academic", "Assertive"],
    { message: "Invalid tone selection" },
  ),
  mode: z.enum(["email", "paragraph", "linkedin", "whatsapp"], {
    message: "Invalid mode selection",
  }),
  output_language: z
    .enum(["en", "hindi", "tamil", "marathi", "bengali", "telugu"])
    .optional()
    .default("en"),
  intensity: z.number().int().min(1).max(5).optional().default(3),
});

// ── CHANGED: [BE-2] CreateChatSchema with defaults ──
export const CreateChatSchema = z.object({
  title: z.string().max(200, "Title too long").optional().default("Untitled Chat"),
  mode: z
    .enum(["email", "paragraph", "linkedin", "whatsapp"])
    .optional()
    .default("email"),
});

// ── CHANGED: [BE-2] FeedbackSchema with UUID validation ──
export const FeedbackSchema = z.object({
  jobId: z.string().uuid("Job ID must be a valid UUID"),
  chatId: z.string().uuid("Chat ID must be a valid UUID"),
  rating: z.enum(["up", "down"], {
    message: "Rating must be 'up' or 'down'",
  }),
  reason: z.string().max(500, "Reason too long").optional(),
  mode: z.string().optional(),
  tone: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── NEW: [BE-2] SearchSchema ──
export const SearchSchema = z.object({
  query: z
    .string()
    .min(1, "Query is required")
    .max(100, "Query is too long (max 100 characters)"),
});

// ── NEW: [BE-2] ExportSchema ──
export const ExportSchema = z.object({
  format: z
    .enum(["json", "txt", "markdown"])
    .optional()
    .default("json"),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ── NEW: [BE-2] ShareSchema ──
export const ShareSchema = z.object({
  chatId: z.string().uuid("Chat ID must be a valid UUID"),
  jobId: z.string().uuid("Job ID must be a valid UUID"),
});

// ── NEW: [BE-2] TemplateSchema ──
export const TemplateCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  content: z.string().min(1, "Content is required").max(10000, "Content too long"),
  mode: z.enum(["email", "paragraph", "linkedin", "whatsapp"]),
  tone: z.enum(["Professional", "Friendly", "Concise", "Academic", "Assertive"]),
});

export const TemplateRenameSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
});

// Type exports for consumer convenience
export type MessageInput = z.infer<typeof MessageSchema>;
export type CreateChatInput = z.infer<typeof CreateChatSchema>;
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type ExportInput = z.infer<typeof ExportSchema>;
export type ShareInput = z.infer<typeof ShareSchema>;
export type TemplateCreateInput = z.infer<typeof TemplateCreateSchema>;
export type TemplateRenameInput = z.infer<typeof TemplateRenameSchema>;

// END FILE: lib/writeright-validators.ts
