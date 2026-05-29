import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { logError } from "@/lib/writeright-logger";
import { z } from "zod";

const ProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  icon: z.string().default("Folder"),
});

export async function GET(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.get", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_projects")
        .select("id, name, description, icon, status, created_at, updated_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (error) {
        logError("[api.writeright.projects] Get failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to get projects", 500);
      }

      return NextResponse.json({ projects: data ?? [] });
    });
  });
}

export async function POST(req: Request) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.projects.post", async () => {
      const { userId } = await auth();
      if (!userId) {
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      }
      addSpanAttributes({ "user.id": userId });

      const body = await req.json().catch(() => ({}));
      const parsed = ProjectSchema.safeParse(body);
      if (!parsed.success) {
        throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: parsed.error.issues });
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("writeright_projects")
        .insert({
          user_id: userId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          icon: parsed.data.icon,
        })
        .select()
        .single();

      if (error) {
        logError("[api.writeright.projects] Create failed:", {
          error: error.message,
          ...traceLogFields(),
        });
        throw createApiError("DB_ERROR", "Failed to create project", 500);
      }

      return NextResponse.json({ project: data });
    });
  });
}
