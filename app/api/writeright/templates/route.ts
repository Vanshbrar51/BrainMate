import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";

const VALID_MODES = ["email", "paragraph", "linkedin", "whatsapp"] as const;
const VALID_TONES = ["Professional", "Friendly", "Concise", "Academic", "Assertive"] as const;

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
      const name = (body.name?.trim() || content.slice(0, 50) || "Untitled Template").slice(0, 120);

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
