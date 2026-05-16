import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";

const VALID_MODES = ["email", "paragraph", "linkedin", "whatsapp"] as const;
const VALID_TONES = ["Professional", "Friendly", "Concise", "Academic", "Assertive"] as const;
const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || "dev-token";

async function generateTemplateName(content: string, mode: string): Promise<string | null> {
  try {
    const res = await fetch(`${PYTHON_WORKER_URL}/generate-name`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Token": INTERNAL_API_TOKEN,
      },
      body: JSON.stringify({ content: content.slice(0, 500), mode }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as unknown;
    const name = data && typeof data === "object" ? (data as { name?: unknown }).name : null;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.templates.list", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_templates")
        .select("id, name, content, mode, tone, use_count, created_at, updated_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("use_count", { ascending: false });

      if (error) {
        console.error("[api.writeright.templates.list] Failed", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to fetch templates", 500);
      }

      return NextResponse.json({ templates: data ?? [] });
    });
  });
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.templates.create", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      
      addSpanAttributes({ "user.id": userId });

      const body = await req.json().catch(() => {
        throw createApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
      });

      const content = body.content?.trim() ?? "";
      if (!content) {
        throw createApiError("VALIDATION_ERROR", "Template content is required", 400);
      }

      const mode = VALID_MODES.includes((body.mode ?? "email") as (typeof VALID_MODES)[number])
        ? (body.mode as (typeof VALID_MODES)[number])
        : "email";
      const tone = VALID_TONES.includes((body.tone ?? "Professional") as (typeof VALID_TONES)[number])
        ? (body.tone as (typeof VALID_TONES)[number])
        : "Professional";
      const providedName = typeof body.name === "string" ? body.name.trim() : "";
      const generatedName = providedName ? null : await generateTemplateName(content, mode);
      const name = (providedName || generatedName || `${mode} template ${new Date().toLocaleDateString()}`).slice(0, 120);

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_templates")
        .insert({
          user_id: userId,
          name,
          content: content.slice(0, 10000),
          mode,
          tone,
          metadata: body.metadata ?? {},
        })
        .select("id, name, content, mode, tone, use_count, created_at, updated_at")
        .single();

      if (error || !data) {
        console.error("[api.writeright.templates.create] Failed", {
          error: error?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to create template", 500);
      }

      return NextResponse.json({ template: data }, { status: 201 });
    });
  });
}
