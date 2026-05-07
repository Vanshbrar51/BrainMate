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

from app.config import get_settings, settings
from app.models.job import WritingJob, AIResult, TeachingBlock, ScoreBlock
from app.services.prompt_builder import build_messages
from app.services.model_router import ModelRouter
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
    match_voice_examples,
)
from app.services.embedding_service import get_embedding_service

from opentelemetry import trace

logger = logging.getLogger("writeright.ai_worker")
tracer = trace.get_tracer(__name__)


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
    defaults = DEFAULT_SUGGESTIONS_BY_MODE.get(
        mode, DEFAULT_SUGGESTIONS_BY_MODE["email"])
    return defaults.copy()


def _extract_suggestions(data: dict[str, Any], mode: str) -> list[str]:
    """Return exactly 3 deduplicated, sanitized suggestion chips."""
    suggestions_raw = data.get("suggestions")
    suggestions_list = suggestions_raw if isinstance(
        suggestions_raw, list) else []

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
        # strip internal reasoning trace before processing
        data.pop("cot_reasoning", None)

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
                        mistakes=teaching_data.get(
                            "mistakes", []), better_versions=teaching_data.get(
                            "better_versions", []), explanations=teaching_data.get(
                            "explanations", []), )
                    scores_data = data.get("scores", {})
                    if not isinstance(scores_data, dict):
                        scores_data = {}
                    scores = ScoreBlock(
                        clarity=_clamp_score(scores_data.get("clarity")),
                        tone=_clamp_score(scores_data.get("tone")),
                        impact=_clamp_score(scores_data.get("impact")),
                        verdict=_normalize_verdict(scores_data.get("verdict")),
                    )
                    logger.info(
                        "JSON extraction succeeded after initial parse failure")
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

        improved_match = re.search(
            r'"improved_text"\s*:\s*"((?:\\"|[^"])*?)"', cleaned)
        if improved_match:
            try:
                # Basic string unescaping fallback if standard loads aborts
                # entirely
                fb_text = improved_match.group(1).replace(
                    '\\"', '"').replace('\\n', '\n')
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

        logger.error(
            "Regex parsing heavily failed, resolving to pure content dump")
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
    Uses temperature=0.1 (json_repair task) to minimize creative divergence.
    """
    try:
        repair_msgs = [
            {"role": "system",
             "content": "Fix the broken JSON below. Return ONLY the corrected raw JSON, no markdown."},
            {"role": "user", "content": f"Broken JSON:\n{raw[:2000]}"},
        ]
        # BUG-09 FIX: use "json_repair" task type → temperature=0.1
        repair_response = await router.route(
            task_type="json_repair",
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
            logger.info(
                f"Triggering writing profile analysis for user_id={user_id} (count={usage_count})")
            mistakes = await get_recent_mistakes(user_id, limit=20)
            if mistakes:
                counter = Counter(mistakes)
                top_mistakes = [m for m, _ in counter.most_common(5)]
                await update_writing_profile(user_id, top_mistakes, usage_count)
                logger.info(
                    f"Updated writing profile for user_id={user_id} with {
                        len(top_mistakes)} mistakes")
    except Exception:
        logger.exception("Failed to analyze writing profile")

# ---------------------------------------------------------------------------
# Input Quality Gate (F-BE-11)
# ---------------------------------------------------------------------------

def _quality_gate(text: str) -> tuple[bool, str]:
    """Return (ok, reason) before calling the model.

    Rejects inputs that are too short, non-linguistic, or code-heavy.
    These would produce meaningless improvements and waste LLM tokens.
    """
    stripped = text.strip()
    if len(stripped) < 10:
        return False, "Text is too short to improve meaningfully."
    alpha_ratio = sum(c.isalpha() for c in stripped) / max(len(stripped), 1)
    if alpha_ratio < 0.25:
        return False, "Text appears to contain mostly numbers or symbols."
    code_line_pattern = re.compile(
        r'^\s*(def |class |function |import |const |let |var |#include|<\?php)', re.MULTILINE
    )
    if len(code_line_pattern.findall(stripped)) >= 3:
        return False, "This looks like code. WriteRight works with natural language only."
    return True, ""


# ---------------------------------------------------------------------------
# Job Processor
# ---------------------------------------------------------------------------


async def _generate_draft(
    job: WritingJob,
    settings_instance: Settings,
    history: list[dict[str, Any]],
    profile: list[str],
    on_stream_chunk: Callable[[str, str], Awaitable[None]] | None = None,
) -> tuple[AIResult, dict[str, bool]]:
    with tracer.start_as_current_span("ai_worker.generate_draft") as span:
        span.set_attributes({
            "job.id": job.id,
            "job.mode": job.mode,
            "job.tone": job.tone,
            "job.intensity": job.intensity
        })
        # 2.7. Retrieve Brand Voice style DNA (RAG)
        voice_examples = []
        try:
            # Only retrieve style if user has provided examples
            emb_service = get_embedding_service()
            # Use a lightweight embedding for retrieval
            query_emb = await emb_service.get_embedding(job.content)
            matches = await match_voice_examples(job.user_id, query_emb, count=2)
            voice_examples = [m["content"] for m in matches]
            if voice_examples:
                logger.info("Injected %d Brand Voice examples for user %s", len(voice_examples), job.user_id)
        except Exception:
            logger.warning("Brand Voice retrieval failed (non-fatal)")

        # 3. Build prompt
        messages, prompt_metadata = build_messages(
            user_text=job.content,
            tone=job.tone,
            mode=job.mode,
            output_language=job.output_language,
            history=history,
            profile=profile,
            voice_examples=voice_examples,
            intensity=job.intensity,
            max_history=10,
            max_input_tokens=settings_instance.max_input_tokens,
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
            max_tokens=settings_instance.max_output_tokens,
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

        # AI-02: If result fell back to raw content or regex fallback, attempt repair
        # Regex fallback often results in improved_text being a subset of content.
        # We trigger repair if the parse failed to get a full structured result.
        if (
            result.improved_text == model_response.content.strip()
            or result.improved_text == "Unable to process your request. Please try again."
            or result.teaching.mistakes == [] # Sign of regex fallback/failed parse
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

        return result, prompt_metadata


async def _generate_critique_and_revision(
    draft_result: AIResult,
    job: WritingJob,
    settings_instance: Settings,
) -> AIResult:
    """Phase 2 Critique Layer: Second LLM pass to refine the draft."""
    router = get_model_router()

    critique_prompt = f"""
    You are an expert editor. Review the following draft and improve it further.
    Original user tone: {job.tone}
    Original mode: {job.mode}
    Draft to improve:
    {draft_result.improved_text}

    Return ONLY a JSON object exactly matching the WriteRight schema (improved_text, teaching, follow_up, suggestions, scores).
    """

    messages = [
        {"role": "system", "content": "You are a professional editor. Output only valid JSON."},
        {"role": "user", "content": critique_prompt}
    ]

    try:
        model_response = await router.route(
            task_type="write_improvement",
            messages=messages,
            max_tokens=settings_instance.max_output_tokens,
        )

        result = _parse_ai_response(
            content=model_response.content,
            model=model_response.model,
            prompt_tokens=model_response.prompt_tokens,
            completion_tokens=model_response.completion_tokens,
            mode=job.mode,
        )

        # Merge some context from draft if needed, but we can just use the new result
        # To make sure we keep the same structure:
        if result.improved_text == model_response.content.strip():
             # fallback failed parsing
             return draft_result

        return result
    except Exception as e:
        logger.warning(f"Critique pass failed, returning original draft: {e}")
        return draft_result


def _is_processable_input(text: str) -> tuple[bool, str]:
    """Returns (can_process, rejection_reason)."""
    stripped = text.strip()

    # Too short
    if len(stripped) < 10:
        return False, "Text is too short to improve meaningfully."

    # Only numbers/symbols
    alpha_ratio = sum(c.isalpha() for c in stripped) / max(len(stripped), 1)
    if alpha_ratio < 0.3:
        return False, "Text appears to contain mostly numbers or symbols."

    # Looks like code (more than 3 lines starting with def/function/class/import/const)
    import re as regex
    code_lines = sum(1 for line in stripped.split('\n')
                     if regex.match(r'^\s*(def |class |function |import |const |let |var |\{|\})', line))
    if code_lines >= 3:
        return False, "This looks like code. WriteRight is for natural language writing only."

    return True, ""

async def process_job(
    job: WritingJob,
    settings_instance: Settings,
    on_stream_chunk: Callable[[str, str], Awaitable[None]] | None = None,
    on_status: Callable[[str], Awaitable[None]] | None = None,
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
    with tracer.start_as_current_span("ai_worker.process_job") as span:
        span.set_attributes({
            "job.id": job.id,
            "job.chat_id": job.chat_id,
            "user.id": job.user_id,
        })
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
            logger.warning(
                "Failed to update job status to processing in Supabase (non-fatal)")

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
            logger.warning(
                f"Failed to fetch profile for {
                    job.user_id} (continuing without profile)")

        can_process, reason = _is_processable_input(job.content)
        if not can_process:
            from app.models.job import AIResult, TeachingBlock, ScoreBlock
            return AIResult(
                improved_text=job.content,
                teaching=TeachingBlock(
                    mistakes=[reason],
                    better_versions=["Please provide natural language text to improve."],
                    explanations=["WriteRight is designed for emails, paragraphs, LinkedIn posts, and WhatsApp messages."]
                ),
                follow_up="Try pasting an email draft or a paragraph you've written.",
                suggestions=["Try an email draft", "Try a LinkedIn post", "Try a paragraph"],
                scores=ScoreBlock(clarity=0, tone=0, impact=0, verdict="Needs more work"),
                model="quality_gate",
                prompt_tokens=0,
                completion_tokens=0,
            )

        if on_status:
            await on_status("drafting")

        # F-BE-11: Quality gate — short-circuit before calling the model
        ok, gate_reason = _quality_gate(job.content)
        if not ok:
            logger.info(
                '{"event": "job.quality_gate", "job_id": "%s", "reason": "%s"}',
                job.id, gate_reason,
            )
            return AIResult(
                improved_text=job.content,
                teaching=TeachingBlock(
                    mistakes=[gate_reason],
                    better_versions=["Please provide a natural language text to improve."],
                    explanations=[
                        "WriteRight is designed for emails, LinkedIn posts, paragraphs, and WhatsApp messages."
                    ],
                ),
                follow_up="Try pasting an email draft or a paragraph you\u2019ve written.",
                suggestions=["Try an email draft", "Try a LinkedIn post", "Try a paragraph"],
                scores=ScoreBlock(clarity=0, tone=0, impact=0, verdict="Needs more work"),
                model="quality_gate",
                prompt_tokens=0,
                completion_tokens=0,
            )

        result, prompt_metadata = await _generate_draft(
            job=job,
            settings_instance=settings_instance,
            history=history,
            profile=profile,
            on_stream_chunk=on_stream_chunk,
        )

        if settings_instance.enable_critique_pipeline:
            if on_status:
                await on_status("critiquing")
            result = await _generate_critique_and_revision(result, job, settings_instance)

        if on_status:
            await on_status("finalizing")


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
            logger.exception(
                "Failed to update job status to completed in Supabase")

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

        # 9. Streaks + achievements — now primarily handled by DB trigger fn_update_writeright_streak()
        # on writeright_usage INSERT. Python-side call kept as a fallback / for achievement logic.
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

        # F-BE-08: Writing profile analysis — now handled by DB trigger fn_update_writeright_profile().
        # The asyncio.create_task() fire-and-forget pattern is replaced by the DB trigger,
        # which is atomic and cannot be silently cancelled on worker restart.
        logger.info(
            '{"event": "job.profile_update", "job_id": "%s", "note": "handled_by_db_trigger"}',
            job.id,
        )

        # F-07 / BUG-04: Generate Chat Title — guarded inside update_chat_title() in supabase_client.py.
        # Only overwrites auto-generated titles (those starting with 📝 or "Untitled Chat").
        def _trigger_title_gen() -> None:
            words = result.improved_text.split()
            if len(words) > 0:
                short_text = " ".join(words[:5]) + "..."
                asyncio.create_task(
                    update_chat_title(
                        job.chat_id,
                        f"\U0001f4dd {short_text}"))

        _trigger_title_gen()

        return result
