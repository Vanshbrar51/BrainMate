from fastapi import APIRouter, Header, HTTPException, Body
from app.config import settings
from app.services.ai_worker import get_model_router
from app.services.prompt_builder import build_dev_helper_prompt, build_study_mate_prompt, build_interview_pro_prompt, build_content_flow_prompt

router = APIRouter()

async def verify_token(x_internal_api_token: str = Header(None)):
    if x_internal_api_token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/dev-helper")
async def dev_helper(
    prompt: str = Body(..., embed=True),
    x_internal_api_token: str = Header(None)
):
    await verify_token(x_internal_api_token)
    model_router = get_model_router()
    system, user = build_dev_helper_prompt(prompt)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    result = await model_router.route_with_fallback(task_type="write_improvement", messages=messages)
    return {"content": result.content}

@router.post("/study-mate")
async def study_mate(
    prompt: str = Body(..., embed=True),
    x_internal_api_token: str = Header(None)
):
    await verify_token(x_internal_api_token)
    model_router = get_model_router()
    system, user = build_study_mate_prompt(prompt)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    result = await model_router.route_with_fallback(task_type="write_improvement", messages=messages)
    return {"content": result.content}

@router.post("/interview-pro")
async def interview_pro(
    prompt: str = Body(..., embed=True),
    session_id: str = Body(None, embed=True),
    x_internal_api_token: str = Header(None)
):
    await verify_token(x_internal_api_token)
    model_router = get_model_router()
    system, user = build_interview_pro_prompt(prompt, session_id)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    result = await model_router.route_with_fallback(task_type="write_improvement", messages=messages)
    return {"content": result.content}

@router.post("/content-flow")
async def content_flow(
    prompt: str = Body(..., embed=True),
    target_platform: str = Body(None, embed=True),
    x_internal_api_token: str = Header(None)
):
    await verify_token(x_internal_api_token)
    model_router = get_model_router()
    system, user = build_content_flow_prompt(prompt, target_platform)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    result = await model_router.route_with_fallback(task_type="write_improvement", messages=messages)
    return {"content": result.content}
