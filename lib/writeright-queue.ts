// lib/writeright-queue.ts — Redis queue system for WriteRight AI jobs
//
// Extends lib/redis.ts patterns: uses getRedisPool() + ns() for all keys.
// Queue is a ZSET (writeright:jobs) with score = enqueue timestamp.
// Job status in HASH, results in XSTREAM, cache in STRING.
//
// Architecture:
//   - Enqueue: ZADD to ZSET (score = Date.now())
//   - Dequeue: ZPOPMIN from ZSET (atomic, Python worker side)
//   - Status: HSET/HGET on per-job HASH with TTL
//   - Results: XADD/XREAD on per-job capped stream
//   - Cache: SHA-256(text:tone:mode) → STRING with TTL
//   - Rate limit: INCR + EXPIRE (60s sliding window)

import { getRedisPool, ns, isCircuitOpen } from "@/lib/redis";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WritingJobPayload {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  content: string;
  tone: string;
  mode: string;
  output_language?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  intensity?: number;
  attempt: number;
  traceparent?: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "retrying";

export interface JobStatusPayload {
  status: JobStatus;
  created_at: string;
  user_id: string;
  chat_id: string;
  error?: string;
}

export interface AIJobResult {
  improved_text: string;
  english_version?: string;
  teaching: {
    mistakes: string[];
    better_versions: string[];
    explanations: string[];
  };
  follow_up: string;
  suggestions?: string[];
  scores?: {
    clarity: number;
    tone: number;
    impact: number;
    verdict: string;
  };
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

// ---------------------------------------------------------------------------
// Redis Key Schema (all namespaced via ns())
// ---------------------------------------------------------------------------
//
// writeright:jobs                        → ZSET  (job queue, score = timestamp)
// writeright:job:{jobId}                 → HASH  (status, created_at, user_id, chat_id)
// writeright:result:{jobId}              → XSTREAM (AI results)
// writeright:cache:{sha256}              → STRING (cached AI response, JSON)
// writeright:ratelimit:{userId}          → STRING (INCR counter, 60s TTL)

const KEY_JOBS = "writeright" as const;
const KEY_JOBS_QUEUE = "jobs" as const;

function jobsKey(): string {
  return ns(KEY_JOBS, KEY_JOBS_QUEUE);
}

function jobStatusKey(jobId: string): string {
  return ns(KEY_JOBS, "job", jobId);
}

function jobResultKey(jobId: string): string {
  return ns(KEY_JOBS, "result", jobId);
}

function cacheKey(inputHash: string): string {
  return ns(KEY_JOBS, "cache", inputHash);
}

function rateLimitKey(userId: string): string {
  return ns(KEY_JOBS, "ratelimit", userId);
}

function idempotencyKey(userId: string, requestKey: string): string {
  return ns(KEY_JOBS, "idempotency", userId, requestKey);
}

// ---------------------------------------------------------------------------
// Job Enqueue (Next.js API → Redis)
// ---------------------------------------------------------------------------

/**
 * Enqueue a WriteRight AI job into the Redis ZSET.
 * Score is the enqueue timestamp (Date.now()) for FIFO ordering.
 * Future scores can be used for delayed retry.
 */
export async function enqueueWriteRightJob(job: WritingJobPayload): Promise<void> {
  if (isCircuitOpen()) {
    throw new Error("[writeright-queue] Cannot enqueue: Redis circuit is open");
  }

  const redis = getRedisPool();
  const score = Date.now();
  const member = JSON.stringify(job);

  await redis.zadd(jobsKey(), score, member);

  // Also set initial job status in HASH
  await setJobStatus(job.id, "pending", 3600, {
    created_at: new Date().toISOString(),
    user_id: job.userId,
    chat_id: job.chatId,
    output_language: job.output_language ?? "en",
  });
}

// ---------------------------------------------------------------------------
// Job Dequeue (for reference — Python worker uses ZPOPMIN directly)
// ---------------------------------------------------------------------------

/**
 * Dequeue jobs from the ZSET using ZPOPMIN.
 * This is primarily used by the Python worker. Included here for
 * completeness and potential Node.js fallback worker.
 */
export async function dequeueWriteRightJobs(batchSize: number = 1): Promise<WritingJobPayload[]> {
  if (isCircuitOpen()) return [];

  const redis = getRedisPool();
  // ZPOPMIN returns [member, score, member, score, ...]
  const results = await redis.zpopmin(jobsKey(), batchSize);

  const jobs: WritingJobPayload[] = [];
  // Results come as [member1, score1, member2, score2, ...]
  for (let i = 0; i < results.length; i += 2) {
    try {
      const job = JSON.parse(results[i] as string) as WritingJobPayload;
      jobs.push(job);
    } catch {
      console.error("[writeright-queue] Failed to parse dequeued job:", results[i]);
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Job Status (HASH per job with TTL)
// ---------------------------------------------------------------------------

/**
 * Set job status in a Redis HASH with TTL.
 * Default TTL is 3600s (1 hour) — completed/failed jobs auto-expire.
 */
export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  ttlSecs: number = 3600,
  extra?: Record<string, string>,
): Promise<void> {
  const redis = getRedisPool();
  const key = jobStatusKey(jobId);

  const fields: Record<string, string> = {
    status,
    updated_at: new Date().toISOString(),
    ...(extra ?? {}),
  };

  // HSET all fields, then set TTL
  const pipeline = redis.pipeline();
  pipeline.hset(key, fields);
  pipeline.expire(key, ttlSecs);
  await pipeline.exec();
}

/**
 * Get the current status of a job from Redis.
 * Returns null if the job has expired or doesn't exist.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusPayload | null> {
  const redis = getRedisPool();
  const key = jobStatusKey(jobId);

  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;

  return {
    status: (data.status as JobStatus) ?? "pending",
    created_at: data.created_at ?? "",
    user_id: data.user_id ?? "",
    chat_id: data.chat_id ?? "",
    error: data.error,
  };
}

// ---------------------------------------------------------------------------
// Job Results (XSTREAM per job)
// ---------------------------------------------------------------------------

/**
 * Publish the AI result to a Redis Stream for the given job.
 * The client polls this stream via readJobResult().
 * Capped at ~1000 entries to prevent unbounded growth.
 */
export async function publishJobResult(jobId: string, result: AIJobResult): Promise<void> {
  const redis = getRedisPool();
  const key = jobResultKey(jobId);

  await redis.xadd(
    key,
    "MAXLEN",
    "~",
    "1000",
    "*", // auto-generated ID
    "data",
    JSON.stringify(result),
  );

  // Set TTL on the stream so it auto-cleans after 1 hour
  await redis.expire(key, 3600);
}

/**
 * Read the latest AI result from the job's Redis Stream.
 * Returns null if no result is available yet.
 */
export async function readJobResult(jobId: string): Promise<AIJobResult | null> {
  if (isCircuitOpen()) return null;

  const redis = getRedisPool();
  const key = jobResultKey(jobId);

  // Read all entries from the stream (there should be at most 1 for a job)
  const entries = await redis.xrange(key, "-", "+", "COUNT", 1);

  if (!entries || entries.length === 0) return null;

  const [, fields] = entries[0];
  // fields is [field1, value1, field2, value2, ...]
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === "data") {
      try {
        return JSON.parse(fields[i + 1]) as AIJobResult;
      } catch {
        console.error("[writeright-queue] Failed to parse stream result");
        return null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Response Cache (SHA-256 based, STRING with TTL)
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic cache key from input parameters.
 * SHA-256 of "{text}:{tone}:{mode}" — collision-resistant.
 */
export function computeInputHash(
  text: string,
  tone: string,
  mode: string,
  outputLanguage: string = "en",
  intensity: number = 3,
): string {
  return createHash("sha256").update(`${text}:${tone}:${mode}:${outputLanguage}:${intensity}`).digest("hex");
}

/**
 * Cache an AI response for future identical inputs.
 * Default TTL is 3600s (1 hour).
 */
export async function cacheAIResponse(
  inputHash: string,
  result: AIJobResult,
  ttlSecs: number = 3600,
): Promise<void> {
  if (isCircuitOpen()) return;

  const redis = getRedisPool();
  const key = cacheKey(inputHash);
  await redis.setex(key, ttlSecs, JSON.stringify(result));
}

/**
 * Check cache for a previously computed AI response.
 * Returns null on cache miss.
 */
export async function getCachedAIResponse(inputHash: string): Promise<AIJobResult | null> {
  if (isCircuitOpen()) return null;

  const redis = getRedisPool();
  const key = cacheKey(inputHash);

  const cached = await redis.get(key);
  if (!cached) return null;

  try {
    return JSON.parse(cached) as AIJobResult;
  } catch {
    console.error("[writeright-queue] Failed to parse cached response");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting (INCR + EXPIRE, 60s sliding window)
// ---------------------------------------------------------------------------

/**
 * Check if a user is within the rate limit for WriteRight requests.
 * Uses a simple INCR + EXPIRE pattern with a 60-second window.
 *
 * @param userId - Clerk user ID
 * @param maxPerMinute - Maximum requests per 60-second window (default: 10)
 * @returns { allowed: boolean, remaining: number }
 */
export async function checkRateLimit(
  userId: string,
  maxPerMinute: number = 10,
): Promise<{ allowed: boolean; remaining: number }> {
  if (isCircuitOpen()) {
    return { allowed: true, remaining: maxPerMinute };
  }

  const redis = getRedisPool();
  const key = rateLimitKey(userId);

  // INCR the counter — creates the key with value 1 if it doesn't exist
  const count = await redis.incr(key);

  // Set TTL only on first increment (when count === 1)
  if (count === 1) {
    await redis.expire(key, 60);
  }

  const allowed = count <= maxPerMinute;
  const remaining = Math.max(0, maxPerMinute - count);

  return { allowed, remaining };
}

export async function getIdempotentResponse<T>(
  userId: string,
  requestKey: string,
): Promise<T | null> {
  if (isCircuitOpen()) return null;

  const redis = getRedisPool();
  const cached = await redis.get(idempotencyKey(userId, requestKey));
  if (!cached) return null;

  try {
    return JSON.parse(cached) as T;
  } catch {
    console.error("[writeright-queue] Failed to parse idempotent response");
    return null;
  }
}

export async function setIdempotentResponse<T>(
  userId: string,
  requestKey: string,
  response: T,
  ttlSecs: number = 60,
): Promise<void> {
  if (isCircuitOpen()) return;

  const redis = getRedisPool();
  await redis.setex(
    idempotencyKey(userId, requestKey),
    ttlSecs,
    JSON.stringify(response),
  );
}
