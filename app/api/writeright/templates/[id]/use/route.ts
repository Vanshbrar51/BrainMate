import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.templates.use", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      
      const { id } = await params;
      if (!UUID_RE.test(id)) {
        throw createApiError("VALIDATION_ERROR", "Invalid template id", 400);
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
          throw createApiError("NOT_FOUND", "Template not found", 404);
        }
        console.error("[api.writeright.templates.use] Read failed", {
          error: existingError?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to update template usage", 500);
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
        throw createApiError("DB_ERROR", "Failed to update template usage", 500);
      }

      return NextResponse.json({ template: data });
    });
  });
}
