# python-worker/app/models/job.py — Pydantic models for WriteRight jobs and results
#
# These models define the contract between:
#   - Next.js API (enqueuer) → Redis → Python worker (consumer)
#   - Python worker → Supabase (persistence)
#   - Python worker → Redis stream (result publishing)

from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class TeachingBlock(BaseModel):
    """Structured teaching feedback from the AI."""

    mistakes: list[str] = Field(
        default_factory=list,
        description="Specific mistakes identified in the user's text",
    )
    better_versions: list[str] = Field(
        default_factory=list,
        description="Alternative phrasings for each mistake",
    )
    explanations: list[str] = Field(
        default_factory=list,
        description="Why each mistake is a problem",
    )


class MeetingRequest(BaseModel):
    """Structured meeting request data."""

    found: bool = Field(default=False)
    title: Optional[str] = None
    time: Optional[str] = None
    intent: Optional[str] = None


class ExtractionBlock(BaseModel):
    """Actionable data extracted from the text."""

    action_items: list[str] = Field(default_factory=list)
    deadlines: list[str] = Field(default_factory=list)
    monetary_values: list[str] = Field(default_factory=list)
    meeting_request: MeetingRequest = Field(default_factory=MeetingRequest)


class ScoreBlock(BaseModel):
    """Quality scores for the improved output."""

    clarity: int = Field(
        default=6,
        description="How clear and unambiguous the response is (1-10)",
    )
    tone: int = Field(
        default=6,
        description="How well the response matches the requested tone (1-10)",
    )
    impact: int = Field(
        default=6,
        description="How likely the response is to drive action (1-10)",
    )
    verdict: str = Field(
        default="Needs more work",
        description="Overall one-line verdict for quality",
    )


class AIResult(BaseModel):
    """Structured AI response for a writing improvement request."""

    improved_text: str = Field(
        ...,
        description="Complete rewritten version of the user's text",
    )
    english_version: Optional[str] = Field(
        default=None,
        description="English improved text before translation, when output language is not English",
    )
    teaching: TeachingBlock = Field(
        default_factory=TeachingBlock,
        description="Teaching feedback about the user's writing",
    )
    extraction: ExtractionBlock = Field(
        default_factory=ExtractionBlock,
        description="Actionable data extracted from the text",
    )
    follow_up: str = Field(
        default="",
        description="Actionable follow-up question for the user",
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Three short one-click refinement suggestions",
    )
    scores: ScoreBlock = Field(
        default_factory=ScoreBlock,
        description="Draft quality scores and verdict",
    )
    model: str = Field(
        default="",
        description="Model used for generation",
    )
    prompt_tokens: int = Field(
        default=0,
        description="Number of prompt tokens consumed",
    )
    completion_tokens: int = Field(
        default=0,
        description="Number of completion tokens consumed",
    )


class WritingJob(BaseModel):
    """Job payload as enqueued by Next.js API into the Redis ZSET.

    Note: Chat history is NOT passed through the queue. The worker fetches
    fresh history from Supabase via get_chat_history() to ensure it always
    has the most up-to-date conversation context.
    """

    id: str = Field(alias="id")
    chat_id: str = Field(alias="chatId")
    user_id: str = Field(alias="userId")
    message_id: str = Field(alias="messageId")
    content: str = Field(alias="content")
    tone: str
    mode: str
    output_language: str = "en"
    input_language: str = "auto"
    intensity: int = 3
    attempt: int = 0
    status: str = "pending"
    max_retries: int = 3
    traceparent: str | None = None
    history: list[dict[str, str]] | None = None

    model_config = ConfigDict(populate_by_name=True)
    # history intentionally absent — fetched fresh by ai_worker.process_job()


class ModelResponse(BaseModel):
    """Raw response from the LLM provider (Google AI Studio)."""

    content: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    finish_reason: str = ""
    raw_response: dict = Field(default_factory=dict)  # type: ignore[type-arg]


class MorphRequest(BaseModel):
    """Payload for real-time text morphing."""

    original_text: str
    current_text: str
    tone: str
    intensity: int
    mode: str
    traceparent: Optional[str] = None


class TriageItem(BaseModel):
    """A single analyzed item from a bulk triage request."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()) if 'uuid' in globals() else "")
    subject: str
    summary: str
    urgency: str = Field(description="High | Medium | Low")
    category: str = Field(description="Work | Client | Internal | Spam | Personal")
    smart_replies: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    original_segment: str = Field(description="The original part of the text for this item")


class TriageResponse(BaseModel):
    """Response containing multiple triaged items."""

    items: list[TriageItem]


class TriageRequest(BaseModel):
    """Payload for bulk text triage."""

    raw_text: str
    traceparent: Optional[str] = None


class VoiceIngestRequest(BaseModel):
    """Payload to ingest a new writing example."""

    user_id: str
    content: str


class VoiceExample(BaseModel):
    """Writing style example metadata."""

    id: str
    content: str
    created_at: str


class VoiceListResponse(BaseModel):
    """List of writing examples."""

    examples: list[VoiceExample]


class ModuleRequest(BaseModel):
    """Payload for specialized AI modules."""

    prompt: str
    session_id: Optional[str] = None
    target_platform: Optional[str] = None


class ModuleResponse(BaseModel):
    """Structured response for specialized AI modules."""

    content: str

