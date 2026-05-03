# python-worker/app/routers/triage.py — Bulk inbox triage endpoint
#
# Processes massive text dumps to segment and analyze multiple messages.
# Returns a structured JSON list of actionable items.

import json
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException

from app.models.job import TriageRequest, TriageResponse, TriageItem
from app.services.prompt_builder import build_triage_messages
from app.services.ai_worker import get_model_router
from app.config import get_settings

logger = logging.getLogger("writeright.routers.triage")

router = APIRouter(prefix="/triage", tags=["triage"])


@router.post("", response_model=TriageResponse)
async def triage_bulk_text(
    request: TriageRequest,
    x_internal_api_token: str = Header(None, alias="X-Internal-API-Token"),
) -> TriageResponse:
    """Analyze a bulk text dump and return categorized triage items."""
    
    # 1. Simple internal token check
    if not x_internal_api_token or x_internal_api_token != get_settings().internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 2. Build messages
    messages = build_triage_messages(raw_text=request.raw_text)

    # 3. Call AI (Non-streaming for better JSON consistency in batch)
    router_instance = get_model_router()
    try:
        # Use gemini-1.5-pro for complex batch reasoning if available, 
        # otherwise flash. We'll default to the model router's selection.
        response = await router_instance.route(
            task_type="write_improvement", # Re-using this for config, but can specialize later
            messages=messages,
            traceparent=request.traceparent,
        )

        # 4. Parse and Validate JSON
        # Remove markdown if the model hallucinated it (though prompt says raw JSON)
        content = response.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            data = json.loads(content)
            # Support both {"items": [...]} and raw array [...]
            items_raw = data.get("items", []) if isinstance(data, dict) else data
            
            items = []
            for item in items_raw:
                # Basic validation / default values
                items.append(TriageItem(
                    subject=item.get("subject", "Untitled"),
                    summary=item.get("summary", ""),
                    urgency=item.get("urgency", "Medium"),
                    category=item.get("category", "Work"),
                    action_items=item.get("action_items", []),
                    smart_replies=item.get("smart_replies", []),
                    original_segment=item.get("original_segment", "")
                ))
            
            return TriageResponse(items=items)

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Failed to parse triage JSON: {e}\nContent: {content}")
            raise HTTPException(
                status_code=500, 
                detail=f"AI returned invalid JSON structure: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Triage failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
