// app/api/writeright/job/[jobId]/route.ts — Poll job status and result
//
// GET — Check job status (Redis first, Supabase fallback).
//        If completed, reads result from Redis XSTREAM.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { withSpan, addSpanAttributes, traceLogFields } from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getJobStatus, readJobResult } from "@/lib/writeright-queue";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/writeright/job/[jobId] — Poll job status
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.job.poll", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const { jobId } = await params;

      if (!UUID_RE.test(jobId)) {
        throw createApiError("VALIDATION_ERROR", "Invalid job ID", 400);
      }

      addSpanAttributes({
        "user.id": userId,
        "writeright.job_id": jobId,
      });

      // 1. Try Redis first (fast path)
      try {
        const redisStatus = await getJobStatus(jobId);

        if (redisStatus) {
          if (redisStatus.user_id && redisStatus.user_id !== userId) {
            throw createApiError("NOT_FOUND", "Job not found", 404);
          }

          addSpanAttributes({ "writeright.job_status": redisStatus.status });

          if (redisStatus.status === "completed") {
            const result = await readJobResult(jobId);
            return NextResponse.json({
              status: "completed" as const,
              result: result ?? null,
            });
          }

          if (redisStatus.status === "failed") {
            return NextResponse.json({
              status: "failed" as const,
              error: redisStatus.error ?? "Job processing failed",
            });
          }

          return NextResponse.json({
            status: redisStatus.status,
          });
        }
      } catch (err) {
        console.error("[api.writeright.job] Redis status check failed:", {
          error: err instanceof Error ? err.message : String(err),
          job_id: jobId,
          ...traceLogFields(),
        });
      }

      // 2. Fallback to Supabase
      const supabase = getSupabaseAdmin();

      const { data: job, error } = await supabase
        .from("writeright_ai_jobs")
        .select("id, status, output, error, created_at, completed_at")
        .eq("id", jobId)
        .eq("user_id", userId)
        .single();

      if (error || !job) {
        throw createApiError("NOT_FOUND", "Job not found", 404);
      }

      addSpanAttributes({ "writeright.job_status": job.status });

      if (job.status === "completed") {
        let result = null;
        try {
          result = await readJobResult(jobId);
        } catch {
          // Redis unavailable fallback
        }

        return NextResponse.json({
          status: "completed" as const,
          result: result ?? job.output ?? null,
        });
      }

      if (job.status === "failed") {
        return NextResponse.json({
          status: "failed" as const,
          error: job.error ?? "Job processing failed",
        });
      }

      return NextResponse.json({
        status: job.status as "pending" | "processing" | "retrying",
      });
    });
  });
}
