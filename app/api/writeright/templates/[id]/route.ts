import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.templates.rename", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      
      const { id } = await params;
      if (!UUID_RE.test(id)) {
        throw createApiError("VALIDATION_ERROR", "Invalid template id", 400);
      }

      addSpanAttributes({ "user.id": userId, "writeright.template_id": id });

      const body = await req.json().catch(() => {
        throw createApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
      });

      const name = body.name?.trim() ?? "";
      if (!name) {
        throw createApiError("VALIDATION_ERROR", "Template name is required", 400);
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
          throw createApiError("NOT_FOUND", "Template not found", 404);
        }
        console.error("[api.writeright.templates.rename] Failed", {
          error: error?.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to update template", 500);
      }

      return NextResponse.json({ template: data });
    });
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.templates.delete", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      
      const { id } = await params;
      if (!UUID_RE.test(id)) {
        throw createApiError("VALIDATION_ERROR", "Invalid template id", 400);
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
        throw createApiError("DB_ERROR", "Failed to delete template", 500);
      }
      if (!count) {
        throw createApiError("NOT_FOUND", "Template not found", 404);
      }

      return NextResponse.json({ ok: true });
    });
  });
}
