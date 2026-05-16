import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withSpan, addSpanAttributes } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const BodySchema = z.object({ jobId: z.string().uuid() });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scoreFromOutput(output: unknown): number {
  if (!output || typeof output !== "object") return 0;
  const scores = (output as { scores?: unknown }).scores;
  if (!scores || typeof scores !== "object") return 0;
  const row = scores as { clarity?: unknown; tone?: unknown; impact?: unknown };
  return [row.clarity, row.tone, row.impact].reduce<number>((sum, value) => (
    sum + (typeof value === "number" ? value : 0)
  ), 0);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.challenges.complete.post", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);
      const { id } = await params;
      if (!UUID_RE.test(id)) throw createApiError("VALIDATION_ERROR", "Invalid challenge id", 400);

      const body = BodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) throw createApiError("VALIDATION_ERROR", "Invalid input", 400, { issues: body.error.issues });

      addSpanAttributes({ "user.id": userId, "writeright.challenge_id": id });
      const supabase = getSupabaseAdmin();
      const { data: job, error: jobError } = await supabase
        .from("writeright_ai_jobs")
        .select("id, output, status")
        .eq("id", body.data.jobId)
        .eq("user_id", userId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .single();
      if (jobError || !job) throw createApiError("NOT_FOUND", "Job not found", 404);

      const score = scoreFromOutput(job.output);
      const { error } = await supabase
        .from("writeright_challenge_completions")
        .upsert({
          challenge_id: id,
          user_id: userId,
          job_id: job.id,
          score,
          completed_at: new Date().toISOString(),
        }, { onConflict: "challenge_id,user_id" });
      if (error) throw createApiError("DB_ERROR", "Failed to save challenge completion", 500);

      const { data: leaderboard } = await supabase
        .from("writeright_challenge_completions")
        .select("user_id, score")
        .eq("challenge_id", id)
        .order("score", { ascending: false })
        .order("completed_at", { ascending: true })
        .limit(1000);
      const rows = leaderboard ?? [];
      const rank = rows.findIndex((row) => row.user_id === userId) + 1 || rows.length;
      const percentile = rows.length ? Math.round(((rows.length - rank + 1) / rows.length) * 100) : 100;

      return NextResponse.json({ rank, score, percentile });
    });
  });
}
