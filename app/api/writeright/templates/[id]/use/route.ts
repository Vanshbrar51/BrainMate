import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSpan("api.writeright.templates.use", async () => {
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

    const { data: existing, error: existingError } = await supabase
      .from("writeright_templates")
      .select("use_count")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (existingError || !existing) {
      if (existingError?.code === "PGRST116") {
        return NextResponse.json({ error: "Template not found", code: "NOT_FOUND" }, { status: 404 });
      }
      console.error("[api.writeright.templates.use] Read failed", {
        error: existingError?.message,
        ...traceLogFields(),
      });
      return NextResponse.json({ error: "Failed to update template usage", code: "DB_ERROR" }, { status: 500 });
    }

    const nextUseCount = Math.max(0, (existing.use_count ?? 0) + 1);
    const { data, error } = await supabase
      .from("writeright_templates")
      .update({ use_count: nextUseCount })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, use_count, updated_at")
      .single();

    if (error || !data) {
      console.error("[api.writeright.templates.use] Update failed", {
        error: error?.message,
        ...traceLogFields(),
      });
      return NextResponse.json({ error: "Failed to update template usage", code: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ template: data });
  });
}
