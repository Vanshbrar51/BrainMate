# python-worker/app/services/supabase_client.py — Async Supabase client
#
# Uses the SERVICE ROLE KEY (bypasses RLS). The Python worker is a trusted
# internal service — it never handles HTTP auth directly.
#
# All user-facing access control is enforced by the Next.js API layer.

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, cast

from supabase import create_client, Client
import asyncio
from postgrest.types import CountMethod

from app.config import settings

logger = logging.getLogger("writeright.supabase")

# ---------------------------------------------------------------------------
# Singleton Client
# ---------------------------------------------------------------------------

_client: Client | None = None


def get_supabase() -> Client:
    """Get or create the Supabase client singleton.

    Uses service role key to bypass RLS. The Python worker is a trusted
    internal service — user-scoping is done at enqueue time by Next.js.
    """
    global _client
    if _client is None:
        _client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _client


# ---------------------------------------------------------------------------
# Chat History
# ---------------------------------------------------------------------------

def _fetch_history_sync(chat_id: str, limit: int) -> list[dict[str, Any]]:
    result = (
        get_supabase()
        .table("writeright_messages")
        .select("id, role, content, metadata, created_at")
        .eq("chat_id", chat_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return cast(list[dict[str, Any]], result.data or [])


async def get_chat_history(
        chat_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Fetch chat history from Supabase.

    Returns messages ordered by created_at ASC (oldest first).
    For assistant messages with structured JSON in content, the raw
    content is returned — the prompt builder handles extraction.
    """
    try:
        return await asyncio.to_thread(_fetch_history_sync, chat_id, limit)
    except Exception:
        logger.exception(
            "Failed to fetch chat history for chat_id=%s",
            chat_id)
        return []


# ---------------------------------------------------------------------------
# AI Message Persistence
# ---------------------------------------------------------------------------

def _save_ai_message_sync(
    chat_id: str,
    user_id: str,
    content: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    result = (
        get_supabase()
        .table("writeright_messages")
        .insert({
            "chat_id": chat_id,
            "user_id": user_id,
            "role": "assistant",
            "content": content,
            "metadata": {
                "result_type": "ai_improvement",
                **metadata,
            },
        })
        .execute()
    )

    if not result.data:
        raise ValueError("Insert returned empty data")

    return cast(dict[str, Any], result.data[0])


async def save_ai_message(
    chat_id: str,
    user_id: str,
    content: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    """Save an AI-generated message to Supabase.

    Args:
        chat_id: Chat session ID.
        user_id: Clerk user ID (from job payload, not from auth).
        content: The structured JSON response as a string.
        metadata: Extra metadata (result_type, model, tokens, etc).

    Returns:
        The inserted message record.
    """
    try:
        return await asyncio.to_thread(_save_ai_message_sync, chat_id, user_id, content, metadata)
    except Exception:
        logger.exception(
            "Failed to save AI message for chat_id=%s", chat_id
        )
        raise


# ---------------------------------------------------------------------------
# Chat Operations
# ---------------------------------------------------------------------------

def _update_chat_title_sync(chat_id: str, new_title: str) -> None:
    client = get_supabase()
    try:
        # Check current title
        client.table("writeright_chats").select(
            "title").eq("id", chat_id).single().execute()

        # Very simple heuristic: if it contains "Untitled" or is very short or is raw, we can overwrite.
        # But per simplified F-07 spec, we just overwrite if it's the first message or if requested.
        # Here we just blindly update as the worker heuristic decides.
        response = client.table("writeright_chats").update(
            {"title": new_title, "updated_at": "now()"}).eq("id", chat_id).execute()
        if not response.data:
            logger.warning("No chat updated for id %s", chat_id)
    except Exception as e:
        logger.error("Failed to update chat title for %s: %s", chat_id, e)


async def update_chat_title(chat_id: str, new_title: str) -> None:
    """Update title for the given chat ID."""
    await asyncio.to_thread(_update_chat_title_sync, chat_id, new_title)


# ---------------------------------------------------------------------------
# Job Status Update
# ---------------------------------------------------------------------------

def _update_job_status_sync(
    job_id: str,
    status: str,
    output: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    update_data: dict[str, Any] = {"status": status}
    if output is not None:
        update_data["output"] = output
    if error is not None:
        update_data["error"] = error
    if status == "completed":
        from datetime import datetime, timezone

        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()

    (
        get_supabase()
        .table("writeright_ai_jobs")
        .update(update_data)
        .eq("id", job_id)
        .execute()
    )


async def update_job_status(
    job_id: str,
    status: str,
    output: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Update the AI job status in Supabase.

    Args:
        job_id: The job UUID.
        status: One of 'pending', 'processing', 'completed', 'failed', 'retrying'.
        output: Optional structured output (AIResult as dict) on completion.
        error: Optional error message on failure.
    """
    try:
        await asyncio.to_thread(_update_job_status_sync, job_id, status, output, error)
    except Exception:
        logger.exception("Failed to update job status for job_id=%s", job_id)
        raise


# ---------------------------------------------------------------------------
# Usage Tracking
# ---------------------------------------------------------------------------

def _record_usage_sync(
    user_id: str,
    job_id: str,
    chat_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    (
        get_supabase()
        .table("writeright_usage")
        .insert({
            "user_id": user_id,
            "job_id": job_id,
            "chat_id": chat_id,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        })
        .execute()
    )


async def record_usage(
    user_id: str,
    job_id: str,
    chat_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    """Record token consumption for billing/analytics.

    Args:
        user_id: Clerk user ID.
        job_id: The AI job UUID.
        chat_id: The chat session UUID.
        model: Model identifier used.
        prompt_tokens: Number of prompt tokens consumed.
        completion_tokens: Number of completion tokens generated.
    """
    try:
        await asyncio.to_thread(_record_usage_sync, user_id, job_id, chat_id, model, prompt_tokens, completion_tokens)
    except Exception:
        # Usage tracking failure should never block job completion
        logger.exception(
            "Failed to record usage for job_id=%s (non-fatal)", job_id
        )


# ---------------------------------------------------------------------------
# Streaks + Achievements
# ---------------------------------------------------------------------------

ALL_TONES = {"Professional", "Friendly", "Concise", "Academic", "Assertive"}


def _safe_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _update_streak_and_achievements_sync(
    user_id: str,
    mode: str,
    tone: str,
    injection_detected: bool,
    teaching_mistakes: list[str],
) -> None:
    client = get_supabase()
    today = datetime.now(timezone.utc).date()

    # 1) Update streak row
    streak_res = (
        client.table("writeright_streaks")
        .select("id, current_streak, longest_streak, last_activity_date")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    streak_row_json = streak_res.data[0] if streak_res.data else None
    streak_row = cast(
        dict[str, Any], streak_row_json) if streak_row_json else None

    if not streak_row:
        current_streak = 1
        longest_streak = 1
        (
            client.table("writeright_streaks")
            .insert({
                "user_id": user_id,
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "last_activity_date": today.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .execute()
        )
    else:
        previous_date = _safe_date(streak_row.get("last_activity_date"))
        current_streak = int(streak_row.get("current_streak", 0) or 0)
        longest_streak = int(streak_row.get("longest_streak", 0) or 0)

        if previous_date == today:
            # Same day job — no streak increment.
            pass
        elif previous_date and (today - previous_date).days == 1:
            current_streak += 1
        else:
            current_streak = 1

        longest_streak = max(longest_streak, current_streak)
        (
            client.table("writeright_streaks")
            .update({
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "last_activity_date": today.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("user_id", user_id)
            .execute()
        )

    # 2) Aggregate usage for achievements
    usage_rows = (
        client.table("writeright_usage")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    total_improvements = len(usage_rows)

    job_rows = (
        client.table("writeright_ai_jobs")
        .select("metadata")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .execute()
    ).data or []

    tones_used: set[str] = set()
    whatsapp_jobs = 0
    for row in job_rows:
        metadata = row.get("metadata") if isinstance(row, dict) else {}
        metadata = metadata if isinstance(metadata, dict) else {}
        row_mode = metadata.get("mode")
        row_tone = metadata.get("tone")
        if isinstance(row_tone, str):
            tones_used.add(row_tone)
        if row_mode == "whatsapp":
            whatsapp_jobs += 1

    achievements: set[str] = set()
    if total_improvements >= 1:
        achievements.add("first_improvement")
    if (not injection_detected and any("kindly revert" in m.lower()
                                       for m in teaching_mistakes if isinstance(m, str))):
        achievements.add("indian_english_fixer")
    if mode == "whatsapp" and whatsapp_jobs >= 10:
        achievements.add("hinglish_hero")
    if total_improvements >= 50:
        achievements.add("power_writer")
    if ALL_TONES.issubset(tones_used | ({tone} if tone else set())):
        achievements.add("tone_master")
    if current_streak >= 3:
        achievements.add("streak_3")
    if current_streak >= 7:
        achievements.add("streak_7")

    now_iso = datetime.now(timezone.utc).isoformat()
    for achievement in achievements:
        try:
            (
                client.table("writeright_achievements")
                .insert({
                    "user_id": user_id,
                    "achievement": achievement,
                    "earned_at": now_iso,
                })
                .execute()
            )
        except Exception:
            # Duplicate inserts are expected due unique(user_id, achievement).
            continue


async def update_streak_and_achievements(
    user_id: str,
    mode: str,
    tone: str,
    injection_detected: bool,
    teaching_mistakes: list[str],
) -> None:
    """Update user streak metrics and award achievements (best-effort)."""
    try:
        await asyncio.to_thread(
            _update_streak_and_achievements_sync,
            user_id,
            mode,
            tone,
            injection_detected,
            teaching_mistakes,
        )
    except Exception:
        logger.exception(
            "Failed to update streak/achievements for user_id=%s (non-fatal)",
            user_id,
        )

# ---------------------------------------------------------------------------
# Personal Writing Profile (F-04)
# ---------------------------------------------------------------------------


def _get_usage_count_sync(user_id: str) -> int:
    client = get_supabase()
    res = client.table("writeright_usage").select(
        "id", count=CountMethod.exact).eq(
        "user_id", user_id).execute()
    return res.count if res.count is not None else 0


async def get_usage_count(user_id: str) -> int:
    try:
        return await asyncio.to_thread(_get_usage_count_sync, user_id)
    except Exception:
        logger.warning(f"Failed to get usage count for {user_id}")
        return 0


def _get_writing_profile_sync(user_id: str) -> list[str]:
    client = get_supabase()
    res = client.table("writeright_writing_profiles").select(
        "top_mistakes").eq("user_id", user_id).limit(1).execute()
    if res.data:
        row = cast(dict[str, Any], res.data[0])
        mistakes = row.get("top_mistakes")
        if isinstance(mistakes, list):
            return mistakes
    return []


async def get_writing_profile(user_id: str) -> list[str]:
    try:
        return await asyncio.to_thread(_get_writing_profile_sync, user_id)
    except Exception:
        logger.warning(f"Failed to fetch profile for {user_id}")
        return []


def _get_recent_mistakes_sync(user_id: str, limit: int = 20) -> list[str]:
    client = get_supabase()
    res = client.table("writeright_messages") \
        .select("content") \
        .eq("user_id", user_id) \
        .eq("role", "assistant") \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()

    import json
    all_mistakes = []
    for row_json in (res.data or []):
        row = cast(dict[str, Any], row_json)
        try:
            content = json.loads(row.get("content", "{}"))
            mistakes = content.get("teaching", {}).get("mistakes", [])
            for m in mistakes:
                if isinstance(m, str) and m.strip():
                    all_mistakes.append(m.strip())
        except Exception:
            pass
    return all_mistakes


async def get_recent_mistakes(user_id: str, limit: int = 20) -> list[str]:
    try:
        return await asyncio.to_thread(_get_recent_mistakes_sync, user_id, limit)
    except Exception:
        logger.warning(f"Failed to get recent mistakes for {user_id}")
        return []


def _update_writing_profile_sync(
        user_id: str,
        mistakes: list[str],
        count: int) -> None:
    client = get_supabase()
    from datetime import datetime, timezone

    upsert_data = {
        "user_id": user_id,
        "top_mistakes": mistakes,
        "improvement_count": count,
        "last_analyzed_at": datetime.now(timezone.utc).isoformat()
    }

    # We use upsert on a unique user_id field
    # In Supabase/PostgREST, we can just upsert. If it exists, it updates.
    client.table("writeright_writing_profiles").upsert(
        upsert_data, on_conflict="user_id").execute()  # type: ignore


async def update_writing_profile(
        user_id: str,
        mistakes: list[str],
        count: int) -> None:
    try:
        await asyncio.to_thread(_update_writing_profile_sync, user_id, mistakes, count)
    except Exception:
        logger.exception("Failed to update writing profile")
