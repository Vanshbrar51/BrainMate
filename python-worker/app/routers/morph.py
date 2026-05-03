# python-worker/app/routers/morph.py — Real-time text morphing endpoint
#
# Bypasses the job queue for ultra-fast, interactive text manipulation.
# Uses StreamingResponse to provide immediate token-by-token feedback.

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.models.job import MorphRequest
from app.services.prompt_builder import build_morph_messages
from app.services.ai_worker import get_model_router
from app.config import get_settings

logger = logging.getLogger("writeright.routers.morph")

router = APIRouter(prefix="/morph", tags=["morph"])


@router.post("")
async def morph_text(
    request: MorphRequest,
    x_internal_api_token: str = Header(None, alias="X-Internal-API-Token"),
) -> StreamingResponse:
    """Morph text based on new tone/intensity with low latency."""
    
    # Simple internal token check (shared secret)
    if not x_internal_api_token or x_internal_api_token != get_settings().internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    messages = build_morph_messages(
        original_text=request.original_text,
        current_text=request.current_text,
        tone=request.tone,
        intensity=request.intensity,
        mode=request.mode,
    )

    async def generate() -> AsyncGenerator[str, None]:
        router_instance = get_model_router()
        import asyncio
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def token_callback(chunk: str, _: str) -> None:
            await queue.put(chunk)

        async def run_router():
            try:
                await router_instance.route_stream(
                    task_type="write_improvement",
                    messages=messages,
                    traceparent=request.traceparent,
                    on_token=token_callback,
                    model_override="gemini-1.5-flash"
                )
            except Exception as e:
                logger.error(f"Morph router task failed: {e}")
                await queue.put(f"Error: {str(e)}")
            finally:
                await queue.put(None)

        asyncio.create_task(run_router())

        while True:
            chunk = await queue.get()
            if chunk is None:
                break
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")
