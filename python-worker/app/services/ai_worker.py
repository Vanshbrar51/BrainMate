# python-worker/app/services/ai_worker.py — Job processing orchestrator
#
# Orchestrates the full AI job pipeline:
#   1. Fetch chat history from Supabase
#   2. Build prompt (tone + mode + history + injection defense)
#   3. Call Google AI Studio via ModelRouter
#   4. Parse structured JSON response
#   5. Persist AI message to Supabase
#   6. Update job status in Supabase
#   7. Record token usage
#
# This module is called by queue_consumer.py for each dequeued job.

from __future__ import annotations

import json
import re
import logging
import asyncio
from collections import Counter
from collections.abc import Awaitable, Callable
from typing import Any

from app.config import settings
from app.models.job import WritingJob, AIResult, TeachingBlock, ScoreBlock
from app.services.prompt_builder import build_messages
from app.services.model_router import ModelRouter, ModelTimeoutError, ModelError
from app.services.supabase_client import (
    get_chat_history,
    save_ai_message,
    update_job_status,
    record_usage,
    update_streak_and_achievements,
    get_usage_count,
    get_writing_profile,
    get_recent_mistakes,
    update_writing_profile,
    update_chat_title,
)

logger = logging.getLogger("writeright.ai_worker")

# ---------------------------------------------------------------------------
# Module-level model router (shared across all jobs in this process)
# ---------------------------------------------------------------------------

_model_router: ModelRouter | None = None


def get_model_router() -> ModelRouter:
    """Get or create the ModelRouter singleton."""
    global _model_router
    if _model_router is None:
        _model_router = ModelRouter()
    return _model_router


async def close_model_router() -> None:
    """Close the model router's HTTP client."""
    global _model_router
    if _model_router is not None:
        await _model_router.close()
        _model_router = None


# ---------------------------------------------------------------------------
# Response Parsing
# ---------------------------------------------------------------------------

VERDICT_READY = "Ready to send"
VERDICT_NEEDS_WORK = "Needs more work"
VERDICT_STRONG = "Strong draft"

DEFAULT_SUGGESTIONS_BY_MODE: dict[str, list[str]] = {
    "email": ["Make it shorter", "Add a formal closing", "Make it more assertive"],
    "paragraph": ["Simplify the language", "Tighten the structure", "Make it more concise"],
    "linkedin": ["Add a stronger hook", "Make it more concise", "Add a clear CTA"],
    "whatsapp": ["Make it more formal", "Add a clear deadline", "Keep it concise"],
}


def _clamp_score(raw_value: Any, default: int = 6) -> int:
    """Coerce incoming score to an integer in the 1-10 range."""
    try:
        score = int(raw_value)
    except (TypeError, ValueError):
        return default
    return max(1, min(10, score))


def _normalize_verdict(raw_verdict: Any) -> str:
    """Map model verdict text to one of the allowed values."""
    if not isinstance(raw_verdict, str):
        return VERDICT_NEEDS_WORK

    normalized = raw_verdict.strip().lower()
    if normalized == VERDICT_READY.lower():
        return VERDICT_READY
    if normalized in {"needs work", VERDICT_NEEDS_WORK.lower()}:
        return VERDICT_NEEDS_WORK
    if normalized == VERDICT_STRONG.lower():
        return VERDICT_STRONG
    return VERDICT_NEEDS_WORK


def _sanitize_suggestion(raw_suggestion: Any) -> str | None:
    """Sanitize and enforce suggestion chip constraints."""
    if not isinstance(raw_suggestion, str):
        return None

    compact = " ".join(raw_suggestion.strip().split())
    if not compact:
        return None

    words = compact.split(" ")
    if len(words) > 8:
        compact = " ".join(words[:8])

    return compact


def _fallback_suggestions(mode: str) -> list[str]:
    defaults = DEFAULT_SUGGESTIONS_BY_MODE.get(mode, DEFAULT_SUGGESTIONS_BY_MODE["email"])
    return defaults.copy()


def _extract_suggestions(data: dict[str, Any], mode: str) -> list[str]:
    """Return exactly 3 deduplicated, sanitized suggestion chips."""
    suggestions_raw = data.get("suggestions")
    suggestions_list = suggestions_raw if isinstance(suggestions_raw, list) else []

    suggestions: list[str] = []
    seen: set[str] = set()

    for suggestion in suggestions_list:
        cleaned = _sanitize_suggestion(suggestion)
        if not cleaned:
            continue
        dedupe_key = cleaned.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        suggestions.append(cleaned)
        if len(suggestions) == 3:
            return suggestions

    for fallback in _fallback_suggestions(mode):
        dedupe_key = fallback.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        suggestions.append(fallback)
        if len(suggestions) == 3:
            break

    return suggestions


def _parse_ai_response(
    content: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    mode: str,
) -> AIResult:
    """Parse the raw LLM response into a structured AIResult.

    Handles:
    - Valid JSON responses
    - Partial JSON (truncated by token limit)
    - Markdown-wrapped JSON (```json ... ```)
    - Invalid responses (falls back to raw content)
    """
    # Strip markdown code fences if present
    cleaned = content.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        data.pop("cot_reasoning", None)  # strip internal reasoning trace before processing

        # Validate required fields
        improved_text = data.get("improved_text", "")
        if not improved_text:
            raise ValueError("Missing improved_text in AI response")
        english_version = data.get("english_version")
        if not isinstance(english_version, str):
            english_version = None

        teaching_data = data.get("teaching", {})
        teaching = TeachingBlock(
            mistakes=teaching_data.get("mistakes", []),
            better_versions=teaching_data.get("better_versions", []),
            explanations=teaching_data.get("explanations", []),
        )

        follow_up = data.get("follow_up", "")
        suggestions = _extract_suggestions(data, mode)
        scores_data = data.get("scores", {})
        if not isinstance(scores_data, dict):
            scores_data = {}
        scores = ScoreBlock(
            clarity=_clamp_score(scores_data.get("clarity")),
            tone=_clamp_score(scores_data.get("tone")),
            impact=_clamp_score(scores_data.get("impact")),
            verdict=_normalize_verdict(scores_data.get("verdict")),
        )

        return AIResult(
            improved_text=improved_text,
            english_version=english_version,
            teaching=teaching,
            follow_up=follow_up,
            suggestions=suggestions,
            scores=scores,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(
            "Failed to parse structured response, trying JSON extraction: %s",
            str(e),
        )

        # AI-02: Second-chance — extract JSON object containing improved_text
        json_match = re.search(r'\{.*"improved_text".*\}', cleaned, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                data.pop("cot_reasoning", None)
                improved_text = data.get("improved_text", "")
                if improved_text:
                    english_version = data.get("english_version")
                    if not isinstance(english_version, str):
                        english_version = None
                    teaching_data = data.get("teaching", {})
                    teaching = TeachingBlock(
                        mistakes=teaching_data.get("mistakes", []),
                        better_versions=teaching_data.get("better_versions", []),
                        explanations=teaching_data.get("explanations", []),
                    )
                    scores_data = data.get("scores", {})
                    if not isinstance(scores_data, dict):
                        scores_data = {}
                    scores = ScoreBlock(
                        clarity=_clamp_score(scores_data.get("clarity")),
                        tone=_clamp_score(scores_data.get("tone")),
                        impact=_clamp_score(scores_data.get("impact")),
                        verdict=_normalize_verdict(scores_data.get("verdict")),
                    )
                    logger.info("JSON extraction succeeded after initial parse failure")
                    return AIResult(
                        improved_text=improved_text,
                        english_version=english_version,
                        teaching=teaching,
                        follow_up=data.get("follow_up", ""),
                        suggestions=_extract_suggestions(data, mode),
                        scores=scores,
                        model=model,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
            except (json.JSONDecodeError, ValueError):
                pass  # fall through to regex fallback

        logger.warning("JSON extraction failed, falling back to regex")

        improved_match = re.search(r'"improved_text"\s*:\s*"((?:\\"|[^"])*?)"', cleaned)
        if improved_match:
            try:
                # Basic string unescaping fallback if standard loads aborts entirely
                fb_text = improved_match.group(1).replace('\\"', '"').replace('\\n', '\n')
                return AIResult(
                    improved_text=fb_text,
                    english_version=None,
                    teaching=TeachingBlock(),
                    follow_up="Could you try rephrasing your request?",
                    suggestions=_fallback_suggestions(mode),
                    scores=ScoreBlock(),
                    model=model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
            except Exception:
                pass

        logger.error("Regex parsing heavily failed, resolving to pure content dump")
        return AIResult(
            improved_text=content.strip() if content.strip() else "Unable to process your request. Please try again.",
            english_version=None,
            teaching=TeachingBlock(),
            follow_up="Could you try rephrasing your request?",
            suggestions=_fallback_suggestions(mode),
            scores=ScoreBlock(),
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )


async def _repair_json_response(
    raw: str, router: ModelRouter
) -> str | None:
    """AI-02: One-shot repair call to fix malformed JSON.

    Returns the repaired content string, or None if repair fails.
    """
    try:
        repair_msgs = [
            {"role": "system",
             "content": "Fix the broken JSON below. Return ONLY the corrected raw JSON, no markdown."},
            {"role": "user", "content": f"Broken JSON:\n{raw[:2000]}"},
        ]
        repair_response = await router.route(
            task_type="write_improvement",
            messages=repair_msgs,
            max_tokens=1500,
        )
        return repair_response.content.strip()
    except Exception:
        logger.warning("JSON repair call failed")
        return None


# ---------------------------------------------------------------------------
# Writing Profile Analysis (F-04)
# ---------------------------------------------------------------------------

async def analyze_writing_profile(user_id: str) -> None:
    """Analyze the user's past mistakes and update their writing profile.
    Only executes if the usage count is a multiple of 5.
    """
    try:
        usage_count = await get_usage_count(user_id)
        if usage_count > 0 and usage_count % 5 == 0:
            logger.info(f"Triggering writing profile analysis for user_id={user_id} (count={usage_count})")
            mistakes = await get_recent_mistakes(user_id, limit=20)
            if mistakes:
                counter = Counter(mistakes)
                top_mistakes = [m for m, _ in counter.most_common(5)]
                await update_writing_profile(user_id, top_mistakes, usage_count)
                logger.info(f"Updated writing profile for user_id={user_id} with {len(top_mistakes)} mistakes")
    except Exception:
        logger.exception("Failed to analyze writing profile")

# ---------------------------------------------------------------------------
# Job Processor
# ---------------------------------------------------------------------------

async def process_job(
    job: WritingJob,
    on_stream_chunk: Callable[[str, str], Awaitable[None]] | None = None,
) -> AIResult:
    """Process a single WriteRight AI job.

    This is the main entry point called by queue_consumer for each job.

    Args:
        job: The WritingJob payload from Redis.

    Returns:
        AIResult with the improved text, teaching, and follow-up.

    Raises:
        ModelTimeoutError: If the LLM call times out.
        ModelError: If the LLM call fails.
        Exception: For unexpected errors.
    """
    logger.info(
        '{"event": "job.processing", "job_id": "%s", "chat_id": "%s", '
        '"tone": "%s", "mode": "%s", "attempt": %d}',
        job.id,
        job.chat_id,
        job.tone,
        job.mode,
        job.attempt,
    )

    # 1. Update job status to processing in Supabase
    try:
        await update_job_status(job.id, "processing")
    except Exception:
        logger.warning("Failed to update job status to processing in Supabase (non-fatal)")

    # 2. Fetch chat history from Supabase
    history: list[dict[str, Any]] = []
    try:
        raw_history = await get_chat_history(job.chat_id, limit=20)
        # Convert to dicts for prompt builder
        history = [
            {"role": msg.get("role", "user"), "content": msg.get("content", "")}
            for msg in raw_history
        ]
    except Exception:
        logger.warning(
            "Failed to fetch chat history for %s (continuing without history)",
            job.chat_id,
        )

    # 2.5. Fetch Personal Writing Profile
    profile: list[str] = []
    try:
        profile = await get_writing_profile(job.user_id)
    except Exception:
        logger.warning(f"Failed to fetch profile for {job.user_id} (continuing without profile)")

    # 3. Build prompt
    messages, prompt_metadata = build_messages(
        user_text=job.content,
        tone=job.tone,
        mode=job.mode,
        output_language=job.output_language,
        history=history,
        profile=profile,
        intensity=job.intensity,
        max_history=10,
        max_input_tokens=settings.max_input_tokens,
    )

    if prompt_metadata.get("injection_detected"):
        logger.warning(
            '{"event": "injection.detected", "job_id": "%s", "chat_id": "%s"}',
            job.id,
            job.chat_id,
        )

    # 4. Call Google AI Studio via ModelRouter
    router = get_model_router()
    model_response = await router.route_stream(
        task_type="write_improvement",
        messages=messages,
        max_tokens=settings.max_output_tokens,
        traceparent=job.traceparent,
        on_token=on_stream_chunk,
    )

    # 5. Parse structured response
    result = _parse_ai_response(
        content=model_response.content,
        model=model_response.model,
        prompt_tokens=model_response.prompt_tokens,
        completion_tokens=model_response.completion_tokens,
        mode=job.mode,
    )

    # AI-02: If result fell back to raw content, attempt repair
    if (
        result.improved_text == model_response.content.strip()
        or result.improved_text == "Unable to process your request. Please try again."
    ):
        logger.info("Attempting JSON repair for job %s", job.id)
        repaired = await _repair_json_response(model_response.content, router)
        if repaired:
            repaired_result = _parse_ai_response(
                content=repaired,
                model=model_response.model,
                prompt_tokens=model_response.prompt_tokens,
                completion_tokens=model_response.completion_tokens,
                mode=job.mode,
            )
            # Only use repaired if it actually parsed better
            if repaired_result.improved_text != repaired.strip():
                logger.info("JSON repair succeeded for job %s", job.id)
                result = repaired_result

    # 6. Persist AI message to Supabase
    try:
        await save_ai_message(
            chat_id=job.chat_id,
            user_id=job.user_id,
            content=json.dumps(result.model_dump()),
            metadata={
                "model": result.model,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "injection_detected": prompt_metadata.get("injection_detected", False),
                "job_id": job.id,
                "mode": job.mode,
                "tone": job.tone,
                "output_language": job.output_language,
            },
        )
    except Exception:
        logger.exception("Failed to save AI message (job still completes)")

    # 7. Update job status to completed in Supabase
    try:
        await update_job_status(
            job.id,
            "completed",
            output=result.model_dump(),
        )
    except Exception:
        logger.exception("Failed to update job status to completed in Supabase")

    # 8. Record usage (non-fatal)
    try:
        await record_usage(
            user_id=job.user_id,
            job_id=job.id,
            chat_id=job.chat_id,
            model=result.model,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        )
    except Exception:
        logger.warning("Failed to record usage (non-fatal)")

    # 9. Streaks + achievements (non-fatal)
    try:
        await update_streak_and_achievements(
            user_id=job.user_id,
            mode=job.mode,
            tone=job.tone,
            injection_detected=bool(prompt_metadata.get("injection_detected", False)),
            teaching_mistakes=result.teaching.mistakes,
        )
    except Exception:
        logger.warning("Failed to update streak/achievements (non-fatal)")


    # Triggers F-04 logic asynchronously
    asyncio.create_task(analyze_writing_profile(job.user_id))

    # F-07: Generate Chat Title intelligently
    def _trigger_title_gen():
        nonlocal result
        words = result.improved_text.split()
        if len(words) > 0:
            short_text = " ".join(words[:5]) + "..."
            asyncio.create_task(update_chat_title(job.chat_id, f"📝 {short_text}"))
    
    _trigger_title_gen()

    return result
