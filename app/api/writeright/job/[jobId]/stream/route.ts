// FILE: app/api/writeright/job/[jobId]/stream/route.ts — Job SSE streaming
// ── CHANGED: [BE-4] SSE Timeout Fix — properly marks failed jobs ──

import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getJobStatus, readJobResult } from "@/lib/writeright-queue";
import { getRedisPool, isCircuitOpen, ns } from "@/lib/redis";
import {
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  traceLogFields,
} from "@/lib/tracing";
import { withErrorHandler, createApiError } from "@/lib/writeright-errors";
import { logError } from "@/lib/writeright-logger";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return withErrorHandler(req, async () => {
    return withSpan("api.writeright.job.stream", async () => {
      const { userId } = await auth();
      if (!userId)
        throw createApiError("UNAUTHORIZED", "Not authenticated", 401);

      const { jobId } = await params;

      // Handle cached results
      if (jobId === "cached") {
        return new Response(
          'event: result\ndata: {"status":"completed","result":null}\n\n',
          {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          },
        );
      }

      if (!UUID_RE.test(jobId))
        throw createApiError("VALIDATION_ERROR", "Invalid job ID", 400);

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
                encoder.encode(
                  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                ),
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

          // ── Subscribe to Redis pub/sub for live token streaming ──
          if (!isCircuitOpen()) {
            try {
              subscriber = getRedisPool().duplicate();
              await subscriber.subscribe(channel);
              subscriber.on(
                "message",
                (incomingChannel: string, message: string) => {
                  if (incomingChannel !== channel) return;
                  try {
                    const parsed = JSON.parse(message) as {
                      chunk?: string;
                      delta?: string;
                    };
                    if (parsed.chunk) {
                      sendEvent("token", {
                        chunk: parsed.chunk,
                        delta: parsed.delta ?? parsed.chunk,
                      });
                    }
                  } catch {
                    sendEvent("token", { chunk: message, delta: message });
                  }
                },
              );
            } catch (err) {
              logError("stream.redis_subscribe_failed", err, traceLogFields());
              await cleanupSubscriber();
            }
          }

          // ── Poll loop ──
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
                    sendEvent("error", {
                      code: "UNAUTHORIZED",
                      error: "Job not found",
                    });
                    break;
                  }

                  sendEvent("status", { status: status.status });

                  if (status.status === "completed") {
                    const result = await readJobResult(jobId);
                    sendEvent("result", { status: "completed", result });
                    addSpanEvent("stream.completed", { job_id: jobId });
                    break;
                  }

                  if (status.status === "failed") {
                    sendEvent("error", {
                      code: "INTERNAL_ERROR",
                      status: "failed",
                      error: status.error ?? "Job failed",
                    });
                    addSpanEvent("stream.failed", {
                      job_id: jobId,
                      error: status.error ?? "unknown",
                    });
                    break;
                  }
                }
              } catch (err) {
                logError(
                  "stream.redis_status_fallback",
                  err,
                  traceLogFields(),
                );
              }
            }

            // ── Fallback: poll Supabase if Redis is unavailable ──
            if (!redisOk) {
              const supabase = getSupabaseAdmin();
              const { data: job, error } = await supabase
                .from("writeright_ai_jobs")
                .select("status, output, error")
                .eq("id", jobId)
                .eq("user_id", userId)
                .single();

              if (error || !job) {
                sendEvent("error", {
                  code: "NOT_FOUND",
                  error: "Job not found",
                });
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
                sendEvent("result", {
                  status: "completed",
                  result: result ?? job.output,
                });
                break;
              }
              if (job.status === "failed") {
                sendEvent("error", {
                  code: "INTERNAL_ERROR",
                  error: job.error ?? "Job failed",
                });
                break;
              }
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          }

          // ── CHANGED: [BE-4] Timeout handler — mark job as failed in Supabase ──
          if (Date.now() - start >= MAX_MS) {
            addSpanEvent("stream.timeout", { job_id: jobId });

            // Critical fix: update Supabase so job doesn't stay stuck in 'pending'
            try {
              const supabase = getSupabaseAdmin();
              await supabase
                .from("writeright_ai_jobs")
                .update({ status: "failed", error: "timeout_90s" })
                .eq("id", jobId)
                .in("status", ["pending", "processing"]); // Only update if still active
            } catch (err) {
              logError("stream.timeout_db_update_failed", err, {
                job_id: jobId,
                ...traceLogFields(),
              });
            }

            // Send error event to client
            sendEvent("error", {
              code: "TIMEOUT",
              error:
                "This took too long. Try with shorter text.",
            });
          }

          await cleanupSubscriber();
          ended = true;
          controller.close();
        },
        async cancel() {
          // Stream closed by client — no-op
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
