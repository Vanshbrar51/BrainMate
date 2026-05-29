import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { logError } from "@/lib/writeright-logger";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ArtifactSchema = z.object({
  title: z.string().min(1).max(200).default('Untitled'),
  content: z.string().min(1).max(100000),
  type: z.enum(['draft', 'paragraph', 'template']).default('draft'),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.artifacts.get", async () => {
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
      
      // Verify project ownership
      const { data: project } = await supabase
        .from("writeright_projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
        
      if (!project) {
        throw createApiError("NOT_FOUND", "Project not found", 404);
      }

      const { data, error } = await supabase
        .from("writeright_artifacts")
        .select("id, title, content, type, metadata, created_at, updated_at")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (error) {
        logError("[api.writeright.artifacts] Get failed:", { error: error.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to get artifacts", 500);
      }

      return NextResponse.json({ artifacts: data ?? [] });
    });
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.artifacts.post", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }

      const { id: projectId } = await params;
      if (!UUID_RE.test(projectId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid project ID", 400);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = ArtifactSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      addSpanAttributes({ "user.id": userId, "project.id": projectId });

      const supabase = getSupabaseAdmin();
      
      // Verify project ownership
      const { data: project } = await supabase
        .from("writeright_projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
        
      if (!project) {
        throw createApiError("NOT_FOUND", "Project not found", 404);
      }

      const { data, error } = await supabase
        .from("writeright_artifacts")
        .insert({
          project_id: projectId,
          user_id: userId,
          title: parsed.data.title,
          content: parsed.data.content,
          type: parsed.data.type,
          metadata: parsed.data.metadata,
        })
        .select()
        .single();

      if (error) {
        logError("[api.writeright.artifacts] Create failed:", { error: error.message, ...traceLogFields() });
        throw createApiError("DB_ERROR", "Failed to create artifact", 500);
      }

      return NextResponse.json({ artifact: data });
    });
  });
}
