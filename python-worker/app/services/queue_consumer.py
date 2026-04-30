# python-worker/app/services/queue_consumer.py — Redis job consumer loop
#
# Main worker loop that polls the writeright:jobs ZSET using ZPOPMIN.
# Uses asyncio.Semaphore for concurrency control and job locks for
# idempotent processing across multiple worker instances.
#
# Flow per job:
#   1. ZPOPMIN from ZSET (atomic dequeue)
#   2. Acquire distributed lock (SET NX EX 60)
#   3. Process job via ai_worker.process_job()
#   4. On success: update status, persist AI message, publish result
#   5. On failure: re-enqueue with future score (exponential backoff)
#   6. On max retries exceeded: mark failed, publish error

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any

import redis.asyncio as aioredis

from app.config import settings
from app.models.job import WritingJob
from app.services.ai_worker import process_job
from app.services.supabase_client import update_job_status
from app.routers.health import increment_metric

logger = logging.getLogger("writeright.queue_consumer")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

JOBS_KEY = "writeright:jobs"
JOB_STATUS_PREFIX = "writeright:job:"
JOB_RESULT_PREFIX = "writeright:result:"
JOB_STREAM_PREFIX = "writeright:stream:"
LOCK_PREFIX = "writeright:lock:"
LOCK_TTL_SECS = settings.job_timeout_seconds * 3
STATUS_TTL_SECS = 3600
DEAD_LETTER_KEY = "writeright:jobs:dead"

# Lua script: atomically pop one job whose score (scheduled time) <= now
# Note: Next.js enqueues with Date.now() which is exactly Python's
# time.time() * 1000
ZPOPMIN_IF_DUE_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local items = redis.call('ZRANGEBYSCORE', key, '-inf', now, 'LIMIT', 0, 1)
if #items == 0 then
    return nil
end
redis.call('ZREM', key, items[1])
return items[1]
"""


# ---------------------------------------------------------------------------
# Status Helpers
# ---------------------------------------------------------------------------

async def _set_job_status(
    redis_client: aioredis.Redis,
    job_id: str,
    status: str,
    extra: dict[str, str] | None = None,
) -> None:
    """Set job status in Redis HASH with TTL."""
    key = f"{JOB_STATUS_PREFIX}{job_id}"
    fields: dict[str, str] = {
        "status": status,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if extra:
        fields.update(extra)

    pipe = redis_client.pipeline()
    pipe.hset(key, mapping=fields)
    pipe.expire(key, STATUS_TTL_SECS)
    await pipe.execute()


async def _publish_result(
    redis_client: aioredis.Redis,
    job_id: str,
    result_data: dict[str, Any],
) -> None:
    """Publish AI result to Redis Stream for client polling."""
    key = f"{JOB_RESULT_PREFIX}{job_id}"
    await redis_client.xadd(
        key,
        {"data": json.dumps(result_data)},
        maxlen=1000,
        approximate=True,
    )
    await redis_client.expire(key, STATUS_TTL_SECS)


async def _publish_stream_status(
    redis_client: aioredis.Redis,
    job_id: str,
    stage: str,
) -> None:
    """Publish structured status chunk to pub/sub channel for live SSE forwarding."""
    channel = f"{JOB_STREAM_PREFIX}{job_id}"
    payload = json.dumps({"stage": stage})
    await redis_client.publish(channel, payload)


async def _publish_stream_chunk(
    redis_client: aioredis.Redis,
    job_id: str,
    chunk: str,
    delta: str,
) -> None:
    """Publish token chunk to pub/sub channel for live SSE forwarding."""
    channel = f"{JOB_STREAM_PREFIX}{job_id}"
    payload = json.dumps({"chunk": chunk, "delta": delta})
    await redis_client.publish(channel, payload)


# ---------------------------------------------------------------------------
# Consumer Loop
# ---------------------------------------------------------------------------

async def consume_jobs(
    worker_id: str,
    redis_client: aioredis.Redis,
    concurrency: int,
) -> None:
    """Main worker loop.

    Uses asyncio.Semaphore for concurrency control.
    Dequeues from writeright:jobs ZSET using ZPOPMIN_IF_DUE_SCRIPT.

    On success: update job status → completed, persist AI message, publish result.
    On failure: increment attempt count, re-enqueue with future score (exp backoff).
    On max retries exceeded: mark as failed, publish error to result stream.
    """
    semaphore = asyncio.Semaphore(concurrency)
    poll_interval = settings.worker_poll_interval_ms / 1000.0
    active_tasks: set[asyncio.Task] = set()

    logger.info(
        "Worker %s started (concurrency=%d, poll_interval=%.1fs)",
        worker_id,
        concurrency,
        poll_interval,
    )

    while True:
        try:
            now_ms = int(time.time() * 1000)
            member = await redis_client.eval(ZPOPMIN_IF_DUE_SCRIPT, 1, JOBS_KEY, now_ms)  # type: ignore

            if member is None:
                await asyncio.sleep(poll_interval)
                continue

            member_str = member.decode(
                "utf-8") if isinstance(member, bytes) else str(member)

            try:
                job_data = json.loads(member_str)
                job = WritingJob(**job_data)
            except (json.JSONDecodeError, Exception) as e:
                logger.error(
                    "Failed to parse job from ZSET: %s (error: %s)",
                    member_str[:200],
                    str(e),
                )
                continue

            # Acquire semaphore slot (blocks if concurrency limit reached)
            await semaphore.acquire()

            async def run_job(j: WritingJob) -> None:
                try:
                    await _process_job_safe(worker_id=worker_id, redis_client=redis_client, job=j)
                finally:
                    semaphore.release()

            task = asyncio.create_task(run_job(job))
            active_tasks.add(task)
            task.add_done_callback(active_tasks.discard)

        except asyncio.CancelledError:
            logger.info("Worker %s cancelled, shutting down", worker_id)
            if active_tasks:
                await asyncio.gather(*active_tasks, return_exceptions=True)
            break
        except Exception:
            logger.exception(
                "Worker %s encountered an error in main loop",
                worker_id)
            await asyncio.sleep(poll_interval)


async def _process_job_safe(
    worker_id: str,
    redis_client: aioredis.Redis,
    job: WritingJob,
) -> None:
    """Process a single job with error handling, locking, and retry logic."""

    # 1. Acquire distributed lock (prevents double-processing)
    lock_key = f"{LOCK_PREFIX}{job.id}"
    lock_value = f"{worker_id}:{time.time()}"

    lock_acquired = await redis_client.set(
        lock_key,
        lock_value,
        nx=True,
        ex=LOCK_TTL_SECS,
    )
    if not lock_acquired:
        logger.debug("Job %s already locked by another worker", job.id)
        return

    try:
        # 2. Update status to processing
        await _set_job_status(redis_client, job.id, "processing")

        # 3. Process with timeout
        _token_buffer = ""
        _word_count_published = 0

        async def on_stream_chunk(chunk: str, full_text: str) -> None:
            nonlocal _token_buffer, _word_count_published
            _token_buffer += chunk

            import re
            if '"improved_text": "' in full_text and _word_count_published < 500:
                match = re.search(r'"improved_text":\s*"((?:[^"\\]|\\.)*)', full_text)
                if match:
                    so_far = match.group(1).replace('\\"', '"').replace('\\n', '\n')
                    words_so_far = so_far.split()
                    if len(words_so_far) > _word_count_published:
                        new_words = words_so_far[_word_count_published:]
                        word_chunk = " ".join(new_words) + " "
                        await _publish_stream_chunk(
                            redis_client=redis_client,
                            job_id=job.id,
                            chunk=word_chunk,
                            delta=word_chunk,
                        )
                        _word_count_published = len(words_so_far)

        async def on_status(stage: str) -> None:
            await _publish_stream_status(
                redis_client=redis_client,
                job_id=job.id,
                stage=stage,
            )

        result = await asyncio.wait_for(
            process_job(job, on_stream_chunk=on_stream_chunk, on_status=on_status),
            timeout=float(settings.job_timeout_seconds),
        )

        # 4. Success — update status and publish result
        result_dict = result.model_dump()

        await _set_job_status(
            redis_client,
            job.id,
            "completed",
        )
        await _publish_result(redis_client, job.id, result_dict)
        try:
            cache_key = f"writeright:cache:{_input_hash_for_cache(job)}"
            await redis_client.setex(cache_key, STATUS_TTL_SECS, json.dumps(result_dict))
        except Exception:
            logger.warning(
                "Failed to cache result for job %s (non-fatal)", job.id)

        logger.info(
            '{"event": "job.completed", "job_id": "%s", "chat_id": "%s", '
            '"model": "%s", "prompt_tokens": %d, "completion_tokens": %d, '
            '"tone": "%s", "mode": "%s"}',
            job.id,
            job.chat_id,
            result.model,
            result.prompt_tokens,
            result.completion_tokens,
            job.tone,
            job.mode,
        )
        increment_metric("jobs_processed")

    except asyncio.TimeoutError:
        logger.error(
            "Job %s timed out after %ds",
            job.id,
            settings.job_timeout_seconds)
        await _handle_failure(
            redis_client=redis_client,
            job=job,
            error=f"Job timed out after {settings.job_timeout_seconds}s",
        )

    except Exception as exc:
        logger.exception("Job %s failed: %s", job.id, str(exc))
        await _handle_failure(
            redis_client=redis_client,
            job=job,
            error=str(exc),
        )

    finally:
        # Release lock
        await redis_client.delete(lock_key)


async def _handle_failure(
    redis_client: aioredis.Redis,
    job: WritingJob,
    error: str,
) -> None:
    """Handle job failure: retry with backoff or move to failed state."""
    job.attempt += 1

    if job.attempt >= settings.job_max_retries:
        # Exhausted retries — mark as permanently failed
        await _set_job_status(
            redis_client,
            job.id,
            "failed",
            {"error": error[:500]},
        )
        await _publish_result(redis_client, job.id, {
            "error": error,
            "status": "failed",
        })

        dead_letter_entry = {
            **job.model_dump(),
            "failed_at": time.time(),
            "final_error": error[:500],
        }
        await redis_client.zadd(DEAD_LETTER_KEY, {json.dumps(dead_letter_entry): time.time()})
        await redis_client.expire(DEAD_LETTER_KEY, 7 * 24 * 3600)

        # Update Supabase
        try:
            await update_job_status(job.id, "failed", error=error[:500])
        except Exception:
            logger.exception(
                "Failed to update Supabase job status for %s", job.id)

        logger.error(
            '{"event": "job.failed", "job_id": "%s", "attempts": %d, "error": "%s"}',
            job.id,
            job.attempt,
            error[:200],
        )
        increment_metric("jobs_failed")
    else:
        # Re-enqueue with exponential backoff
        delay_ms = 1000 * (2 ** (job.attempt - 1))
        future_score = time.time() * 1000 + delay_ms  # millisecond timestamp

        await _set_job_status(
            redis_client,
            job.id,
            "retrying",
            {"error": error[:500]},
        )

        # Re-serialize and add back to ZSET with future score
        await redis_client.zadd(JOBS_KEY, {json.dumps(job.model_dump()): future_score})

        # Update Supabase attempt count
        try:
            await update_job_status(job.id, "retrying", error=error[:500])
        except Exception:
            logger.exception(
                "Failed to update Supabase job status for %s", job.id)

        logger.warning(
            '{"event": "job.retrying", "job_id": "%s", "attempt": %d, "delay_ms": %d}',
            job.id,
            job.attempt,
            delay_ms,
        )


def _input_hash_for_cache(job: WritingJob) -> str:
    cache_material = f"{job.content}:{job.tone}:{job.mode}:{job.output_language or 'en'}:{job.intensity}"
    return hashlib.sha256(cache_material.encode("utf-8")).hexdigest()
