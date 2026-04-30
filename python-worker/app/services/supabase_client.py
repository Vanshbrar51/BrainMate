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
        res = client.table("writeright_chats").select("title").eq("id", chat_id).single().execute()
        if res.data:
            current = res.data.get("title", "")
            if current.startswith("📝 ") or current == "Untitled Chat" or len(current) > 80:
                client.table("writeright_chats").update({"title": new_title}).eq("id", chat_id).execute()
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
