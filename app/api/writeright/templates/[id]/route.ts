import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSpan("api.writeright.templates.rename", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid template id", code: "INVALID_ID" }, { status: 400 });
    }

    addSpanAttributes({ "user.id": userId, "writeright.template_id": id });

    let body: { name?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
    }
    const name = body.name?.trim() ?? "";
    if (!name) {
      return NextResponse.json({ error: "Template name is required", code: "MISSING_NAME" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("writeright_templates")
      .update({ name: name.slice(0, 120) })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, name, content, mode, tone, use_count, created_at, updated_at")
      .single();

    if (error || !data) {
      if (error?.code === "PGRST116") {
        return NextResponse.json({ error: "Template not found", code: "NOT_FOUND" }, { status: 404 });
      }
      console.error("[api.writeright.templates.rename] Failed", {
        error: error?.message,
        ...traceLogFields(),
      });
      return NextResponse.json({ error: "Failed to update template", code: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ template: data });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSpan("api.writeright.templates.delete", async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid template id", code: "INVALID_ID" }, { status: 400 });
    }

    addSpanAttributes({ "user.id": userId, "writeright.template_id": id });

    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from("writeright_templates")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[api.writeright.templates.delete] Failed", {
        error: error.message,
        ...traceLogFields(),
      });
      return NextResponse.json({ error: "Failed to delete template", code: "DB_ERROR" }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: "Template not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  });
}
