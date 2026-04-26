# python-worker/app/routers/health.py — Health check and metrics endpoints
#
# GET /health  — Liveness/readiness probe for container orchestrators
# GET /metrics — Basic worker metrics for observability

from __future__ import annotations

import time
from typing import Any
import asyncio

from fastapi import APIRouter
import redis.asyncio as aioredis

router = APIRouter(tags=["health"])

# ---------------------------------------------------------------------------
# Module-level metrics counters (simple in-memory tracking)
# ---------------------------------------------------------------------------

_metrics = {
    "jobs_processed": 0,
    "jobs_failed": 0,
    "start_time": time.time(),
}


def increment_metric(name: str, amount: int = 1) -> None:
    """Increment a metric counter."""
    _metrics[name] = _metrics.get(name, 0) + amount  # type: ignore[assignment]


def get_metrics() -> dict[str, Any]:
    """Get current metrics snapshot."""
    uptime = time.time() - _metrics["start_time"]  # type: ignore[operator]
    return {
        **_metrics,
        "uptime_seconds": round(uptime, 1),
    }


# ---------------------------------------------------------------------------
# Redis / Supabase connection references (set by main.py on startup)
# ---------------------------------------------------------------------------

_redis_client: aioredis.Redis | None = None
_supabase_connected: bool = False


def set_health_dependencies(
    redis_client: aioredis.Redis | None = None,
    supabase_connected: bool = False,
) -> None:
    """Set references for health check probes. Called by main.py."""
    global _redis_client, _supabase_connected
    _redis_client = redis_client
    _supabase_connected = supabase_connected


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Liveness/readiness probe.

    Returns:
        status: "healthy" | "degraded" | "unhealthy"
        redis_connected: bool
        supabase_connected: bool
        jobs_processed: int
        jobs_failed: int
        uptime_seconds: float
    """
    redis_ok = False
    if _redis_client is not None:
        try:
            await _redis_client.ping()  # type: ignore[misc]
            redis_ok = True
        except Exception:
            pass

    # Live probe Supabase (lightweight)
    supabase_ok = False
    try:
        from app.services.supabase_client import get_supabase
        await asyncio.to_thread(
            lambda: get_supabase().table("writeright_chats").select("id").limit(1).execute()
        )
        supabase_ok = True
    except Exception:
        pass

    status = "healthy" if (redis_ok and supabase_ok) else ("degraded" if redis_ok else "unhealthy")

    return {
        "status": status,
        "redis_connected": redis_ok,
        "supabase_connected": supabase_ok,
        "jobs_processed": _metrics.get("jobs_processed", 0),
        "jobs_failed": _metrics.get("jobs_failed", 0),
        "uptime_seconds": round(time.time() - _metrics["start_time"], 1),  # type: ignore[operator]
    }


@router.get("/metrics")
async def metrics_endpoint() -> dict[str, Any]:
    """Basic worker metrics for observability dashboards."""
    return get_metrics()
