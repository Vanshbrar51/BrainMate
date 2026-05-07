import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from opentelemetry import trace

from app.config import settings
from app.models.job import ModuleRequest, ModuleResponse
from app.services.ai_worker import get_model_router
from app.services.prompt_builder import (
    build_dev_helper_prompt,
    build_study_mate_prompt,
    build_interview_pro_prompt,
    build_content_flow_prompt,
)

logger = logging.getLogger("writeright.routers.modules")
tracer = trace.get_tracer(__name__)
router = APIRouter(tags=["modules"])


async def verify_token(x_internal_api_token: Annotated[str | None, Header()] = None) -> None:
    """Security dependency to verify the internal API token."""
    if x_internal_api_token != settings.internal_api_token:
        logger.warning("Unauthorized access attempt to modules router")
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/dev-helper", response_model=ModuleResponse)
async def dev_helper(
    req: ModuleRequest,
    _auth: None = Depends(verify_token)
) -> ModuleResponse:
    """Explains bugs and provides security-conscious code patches."""
    with tracer.start_as_current_span("router.modules.dev_helper") as span:
        span.set_attribute("module", "dev-helper")
        model_router = get_model_router()
        system, user = build_dev_helper_prompt(req.prompt)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        
        result = await model_router.route_with_fallback(
            task_type="dev_helper",
            messages=messages
        )
        
        return ModuleResponse(content=result.content)


@router.post("/study-mate", response_model=ModuleResponse)
async def study_mate(
    req: ModuleRequest,
    _auth: None = Depends(verify_token)
) -> ModuleResponse:
    """Socratic tutor for academic and technical topics."""
    with tracer.start_as_current_span("router.modules.study_mate") as span:
        span.set_attribute("module", "study-mate")
        model_router = get_model_router()
        system, user = build_study_mate_prompt(req.prompt)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        
        result = await model_router.route_with_fallback(
            task_type="study_mate",
            messages=messages
        )
        
        return ModuleResponse(content=result.content)


@router.post("/interview-pro", response_model=ModuleResponse)
async def interview_pro(
    req: ModuleRequest,
    _auth: None = Depends(verify_token)
) -> ModuleResponse:
    """Role-specific interview preparation and feedback."""
    with tracer.start_as_current_span("router.modules.interview_pro") as span:
        span.set_attribute("module", "interview-pro")
        model_router = get_model_router()
        system, user = build_interview_pro_prompt(req.prompt, req.session_id)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        
        result = await model_router.route_with_fallback(
            task_type="interview_pro",
            messages=messages
        )
        
        return ModuleResponse(content=result.content)


@router.post("/content-flow", response_model=ModuleResponse)
async def content_flow(
    req: ModuleRequest,
    _auth: None = Depends(verify_token)
) -> ModuleResponse:
    """Cross-platform content optimization and repurposing."""
    with tracer.start_as_current_span("router.modules.content_flow") as span:
        span.set_attribute("module", "content-flow")
        model_router = get_model_router()
        system, user = build_content_flow_prompt(req.prompt, req.target_platform)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        
        result = await model_router.route_with_fallback(
            task_type="content_flow",
            messages=messages
        )
        
        return ModuleResponse(content=result.content)

