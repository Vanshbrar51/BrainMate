# python-worker/app/routers/voice.py — Brand Voice (RAG) management endpoint
#
# Handles ingestion of "Gold Standard" writing examples and computes embeddings.
# Also provides CRUD operations for managing the user's stylistic DNA.

import logging
from fastapi import APIRouter, Header, HTTPException, Query

from app.models.job import VoiceIngestRequest, VoiceListResponse, VoiceExample
from app.services.embedding_service import get_embedding_service
from app.services.supabase_client import save_voice_example, get_voice_examples, delete_voice_example
from app.config import get_settings

logger = logging.getLogger("writeright.routers.voice")

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/ingest")
async def ingest_voice_example(
    request: VoiceIngestRequest,
    x_internal_api_token: str = Header(None, alias="X-Internal-API-Token"),
):
    """Generate embedding for a writing example and save to Supabase."""
    
    # 1. Internal token check
    if not x_internal_api_token or x_internal_api_token != get_settings().internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    try:
        # 2. Generate embedding
        service = get_embedding_service()
        embedding = await service.get_embedding(request.content)

        # 3. Save to Supabase
        result = await save_voice_example(
            user_id=request.user_id,
            content=request.content,
            embedding=embedding
        )
        
        return {"status": "success", "id": result.get("id")}

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/examples", response_model=VoiceListResponse)
async def list_voice_examples(
    user_id: str = Query(...),
    x_internal_api_token: str = Header(None, alias="X-Internal-API-Token"),
):
    """List all writing examples for a user."""
    
    if not x_internal_api_token or x_internal_api_token != get_settings().internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        rows = await get_voice_examples(user_id)
        examples = [
            VoiceExample(
                id=str(row["id"]),
                content=row["content"],
                created_at=str(row["created_at"])
            )
            for row in rows
        ]
        return VoiceListResponse(examples=examples)
    except Exception as e:
        logger.error(f"Listing examples failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/examples/{example_id}")
async def remove_voice_example(
    example_id: str,
    user_id: str = Query(...),
    x_internal_api_token: str = Header(None, alias="X-Internal-API-Token"),
):
    """Delete a specific writing example."""
    
    if not x_internal_api_token or x_internal_api_token != get_settings().internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        await delete_voice_example(user_id, example_id)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
