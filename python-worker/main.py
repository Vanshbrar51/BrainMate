# python-worker/main.py — FastAPI application with background worker
#
# Lifespan context manager:
#   - On startup: connect Redis, verify Supabase, start worker tasks
#   - On shutdown: cancel worker tasks, close connections
#
# The worker runs as background asyncio tasks alongside the FastAPI HTTP server.
# Health/metrics endpoints are served on the same port.
#
# Usage:
#   uvicorn main:app --host 0.0.0.0 --port 8000

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI

from app.config import settings
from app.routers.health import router as health_router, set_health_dependencies
from app.routers.morph import router as morph_router
from app.routers.triage import router as triage_router
from app.routers.voice import router as voice_router
from app.routers.modules import router as modules_router
from app.services.queue_consumer import consume_jobs
from app.services.ai_worker import close_model_router
from app.services.embedding_service import close_embedding_service

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("writeright.main")

# ---------------------------------------------------------------------------
# OpenTelemetry (optional)
# ---------------------------------------------------------------------------


def _init_otel() -> None:
    """Initialize OpenTelemetry SDK if OTEL_ENDPOINT is configured."""
    if not settings.otel_endpoint:
        logger.info("OTEL_ENDPOINT not set, skipping OpenTelemetry initialization")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({
            "service.name": settings.otel_service_name,
            "service.version": "0.1.0",
        })

        exporter = OTLPSpanExporter(endpoint=settings.otel_endpoint, insecure=True)
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        logger.info("OpenTelemetry initialized (endpoint=%s)", settings.otel_endpoint)
    except ImportError:
        logger.warning("OpenTelemetry packages not installed, tracing disabled")
    except Exception:
        logger.exception("Failed to initialize OpenTelemetry")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — startup and shutdown hooks."""

    # --- STARTUP ---

    logger.info("WriteRight AI Worker starting up")

    # 1. Initialize OpenTelemetry
    _init_otel()

    # 2. Connect to Redis
    redis_client: aioredis.Redis | None = None
    try:
        redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=False,
            max_connections=20,
        )
        await redis_client.ping()
        logger.info("Redis connected: %s", _mask_url(settings.redis_url))
    except Exception:
        logger.exception("Failed to connect to Redis — worker cannot start")
        raise

    # 3. Verify Supabase connectivity
    supabase_ok = False
    try:
        from app.services.supabase_client import get_supabase

        client = get_supabase()
        # Simple query to verify connectivity
        client.table("writeright_chats").select("id").limit(1).execute()
        supabase_ok = True
        logger.info("Supabase connected: %s", _mask_url(settings.supabase_url))
    except Exception:
        logger.warning("Supabase connectivity check failed — will retry on first job")

    # 4. Set health check dependencies
    set_health_dependencies(
        redis_client=redis_client,
        supabase_connected=supabase_ok,
    )

    # 5. Start background worker task
    task = asyncio.create_task(
        consume_jobs(
            worker_id=f"worker-{os.getpid()}",
            redis_client=redis_client,
            concurrency=settings.worker_concurrency,  # pass full concurrency
        ),
        name="writeright-worker-main",
    )
    worker_tasks = [task]

    logger.info(
        "Started %d worker tasks (PID=%d)",
        len(worker_tasks),
        os.getpid(),
    )

    yield

    # --- SHUTDOWN ---

    logger.info("WriteRight AI Worker shutting down")

    # Cancel all worker tasks
    for task in worker_tasks:
        task.cancel()

    # Wait for tasks to finish (with timeout)
    if worker_tasks:
        done, pending = await asyncio.wait(worker_tasks, timeout=10.0)
        for task in pending:
            logger.warning("Force-cancelling worker task: %s", task.get_name())
            task.cancel()

    # Close connections
    await close_model_router()
    await close_embedding_service()

    # Close Redis
    if redis_client:
        await redis_client.aclose()
        logger.info("Redis connection closed")

    logger.info("WriteRight AI Worker shut down cleanly")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="WriteRight AI Worker",
    description="Background AI job processor for BrainMate WriteRight",
    version="0.1.0",
    lifespan=lifespan,
)

# Register routers
app.include_router(health_router)
app.include_router(morph_router)
app.include_router(triage_router)
app.include_router(voice_router)
app.include_router(modules_router)


# Root endpoint
@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "service": "writeright-worker",
        "version": "0.1.0",
        "status": "running",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mask_url(url: str) -> str:
    """Mask credentials in a URL for safe logging."""
    try:
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(url)
        if parsed.password:
            masked = parsed._replace(
                netloc=f"{parsed.username}:***@{parsed.hostname}"
                + (f":{parsed.port}" if parsed.port else "")
            )
            return urlunparse(masked)
        return url
    except Exception:
        return "***"
