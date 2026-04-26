// FILE: app/api/writeright/job/[jobId]/stream/route.ts — Job status and SSE streaming

import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getJobStatus, readJobResult } from "@/lib/writeright-queue";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.job.stream", async () => {
      const { userId } = await auth();
      if (!userId) throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const { jobId } = await params;
      if (jobId === "cached") {
        return new Response('event: result\ndata: {"status":"completed","result":null}\n\n', {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      
      if (!UUID_RE.test(jobId)) throw createApiError("VALIDATION_ERROR", "Invalid job ID", 400);

      addSpanAttributes({
        "user.id": userId,
        "writeright.job_id": jobId,
      });

      const encoder = new TextEncoder();
      const channel = ns("writeright", "stream", jobId);

      const stream = new ReadableStream({
        async start(controller) {
          let ended = false;
          let subscriber: ReturnType<typeof getRedisPool> | null = null;

          const sendEvent = (event: string, data: unknown) => {
            if (ended) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            } catch {
              ended = true;
            }
          };

          const cleanupSubscriber = async () => {
            if (!subscriber) return;
            try {
              await subscriber.unsubscribe(channel);
            } catch {
              // no-op
            }
            try {
              await subscriber.quit();
            } catch {
              subscriber.disconnect();
            }
            subscriber = null;
          };

          if (!isCircuitOpen()) {
            try {
              subscriber = getRedisPool().duplicate();
              await subscriber.subscribe(channel);
              subscriber.on("message", (incomingChannel: string, message: string) => {
                if (incomingChannel !== channel) return;
                try {
                  const parsed = JSON.parse(message) as { chunk?: string; delta?: string };
                  if (parsed.chunk) {
                    sendEvent("token", { chunk: parsed.chunk, delta: parsed.delta ?? parsed.chunk });
                  }
                } catch {
                  sendEvent("token", { chunk: message, delta: message });
                }
              });
            } catch (err) {
              console.error("[stream] Redis subscribe failed:", {
                error: err instanceof Error ? err.message : String(err),
                ...traceLogFields(),
              });
              await cleanupSubscriber();
            }
          }

          const MAX_MS = 90_000;
          const POLL_MS = 250;
          const start = Date.now();

          while (Date.now() - start < MAX_MS) {
            if (req.signal.aborted) break;

            let redisOk = false;
            if (!isCircuitOpen()) {
              try {
                const status = await getJobStatus(jobId);
                if (status) {
                  redisOk = true;
                  if (status.user_id && status.user_id !== userId) {
                    sendEvent("error", { code: "UNAUTHORIZED", error: "Job not found" });
                    break;
                  }

                  sendEvent("status", { status: status.status });

                  if (status.status === "completed") {
                    const result = await readJobResult(jobId);
                    sendEvent("result", { status: "completed", result });
                    break;
                  }

                  if (status.status === "failed") {
                    sendEvent("error", { code: "INTERNAL_ERROR", status: "failed", error: status.error ?? "Job failed" });
                    break;
                  }
                }
              } catch (err) {
                console.error("[stream] Redis status fallback:", {
                  error: err instanceof Error ? err.message : String(err),
                  ...traceLogFields(),
                });
              }
            }

            if (!redisOk) {
              const supabase = getSupabaseAdmin();
              const { data: job, error } = await supabase
                .from("writeright_ai_jobs")
                .select("status, output, error")
                .eq("id", jobId)
                .eq("user_id", userId)
                .single();

              if (error || !job) {
                sendEvent("error", { code: "NOT_FOUND", error: "Job not found" });
                break;
              }

              sendEvent("status", { status: job.status });

              if (job.status === "completed") {
                let result = null;
                try {
                  result = await readJobResult(jobId);
                } catch {
                  // no-op
                }
                sendEvent("result", { status: "completed", result: result ?? job.output });
                break;
              }
              if (job.status === "failed") {
                sendEvent("error", { code: "INTERNAL_ERROR", error: job.error ?? "Job failed" });
                break;
              }
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          }

          if (Date.now() - start >= MAX_MS) {
            const supabase = getSupabaseAdmin();
            await supabase
              .from("writeright_ai_jobs")
              .update({ status: "failed", error: "timeout_90s" })
              .eq("id", jobId);
            sendEvent("error", { code: "TIMEOUT", error: "This took too long. Please try a shorter text." });
          }

          await cleanupSubscriber();
          ended = true;
          controller.close();
        },
        async cancel() {
          // stream closed by client
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    });
  });
}

// END FILE: app/api/writeright/job/[jobId]/stream/route.ts
