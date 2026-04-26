import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";

const VALID_MODES = ["email", "paragraph", "linkedin", "whatsapp"] as const;
const VALID_TONES = ["Professional", "Friendly", "Concise", "Academic", "Assertive"] as const;

export async function GET() {
  return withSpan("api.writeright.templates.list", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }
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
      return NextResponse.json({ error: "Failed to fetch templates", code: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ templates: data ?? [] });
  });
}

export async function POST(req: Request) {
  return withSpan("api.writeright.templates.create", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }
    addSpanAttributes({ "user.id": userId });

    let body: { name?: string; content?: string; mode?: string; tone?: string; metadata?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
    }

    const content = body.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ error: "Template content is required", code: "MISSING_CONTENT" }, { status: 400 });
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
      return NextResponse.json({ error: "Failed to create template", code: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  });
}
