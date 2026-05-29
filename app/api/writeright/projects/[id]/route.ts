import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { logError, logAudit } from "@/lib/writeright-logger";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.id.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      
      const { id: projectId } = await params;
      if (!UUID_RE.test(projectId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid project ID", 400);
      }
      addSpanAttributes({ "user.id": userId, "project.id": projectId });

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_projects")
        .select("id, name, description, icon, status, created_at, updated_at")
        .eq("id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        if (error?.code === "PGRST116") throw createApiError("NOT_FOUND", "Project not found", 404);
        logError("[api.writeright.projects] Get by ID failed:", { error: error?.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to get project", 500);
      }

      return NextResponse.json({ project: data });
    });
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.id.patch", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: projectId } = await params;
      if (!UUID_RE.test(projectId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid project ID", 400);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = ProjectUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      if (Object.keys(parsed.data).length === 0) {
        return NextResponse.json({ ok: true });
      }

      addSpanAttributes({ "user.id": userId, "project.id": projectId });

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_projects")
        .update(parsed.data)
        .eq("id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .select()
        .single();

      if (error || !data) {
        if (error?.code === "PGRST116") throw createApiError("NOT_FOUND", "Project not found", 404);
        logError("[api.writeright.projects] Update failed:", { error: error?.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to update project", 500);
      }

      return NextResponse.json({ project: data });
    });
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.id.delete", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: projectId } = await params;
      if (!UUID_RE.test(projectId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid project ID", 400);
      }

      addSpanAttributes({ "user.id": userId, "project.id": projectId });

      const supabase = getSupabaseAdmin();
      const { error, data } = await supabase
        .from("writeright_projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .select("id");

      if (error) {
        logError("[api.writeright.projects] Delete failed:", { error: error.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to delete project", 500);
      }

      if (!data || data.length === 0) {
        throw createApiError("NOT_FOUND", "Project not found", 404);
      }

      logAudit("project.deleted", userId, { project_id: projectId });

      return NextResponse.json({ ok: true });
    });
  });
}
