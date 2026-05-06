# python-worker/app/services/model_router.py — AI model abstraction layer
#
# Routes tasks to appropriate AI models via Google AI Studio (OpenAI compatibility API).
# Currently supports Google AI Studio (primary) and Anthropic (fallback).
#
# Features:
#   - Per-task temperature configuration (BUG-09 FIX)
#   - Exponential backoff on 429 (rate limit)
#   - Timeout handling with ModelTimeoutError
#   - W3C trace context propagation
#   - Partial JSON handling on finish_reason == "length"
#   - Anthropic fallback (F-BE-13)

from __future__ import annotations

import json
import logging
import asyncio
from collections.abc import Awaitable, Callable
from typing import Literal

import httpx

from app.config import get_settings
from app.models.job import ModelResponse

logger = logging.getLogger("writeright.model_router")

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ModelTimeoutError(Exception):
    """Raised when the LLM call times out."""
    pass


class ModelRateLimitError(Exception):
    """Raised when the LLM provider returns 429."""

    def __init__(self, retry_after: float = 1.0):
        super().__init__(f"Rate limited, retry after {retry_after}s")
        self.retry_after = retry_after


class ModelError(Exception):
    """Generic model call error."""
    pass


# ---------------------------------------------------------------------------
# Model Router
# ---------------------------------------------------------------------------

# BUG-09 FIX: task-specific temperatures.
# Using 0.7 for JSON repair was causing "creative" fixes that failed parsing.
# Translation needs low temperature for consistency.
_TASK_TEMPERATURES: dict[str, float] = {
    "write_improvement": 0.7,
    "follow_up": 0.4,
    "translation": 0.2,
    "json_repair": 0.1,
}


def _temperature_for_task(task_type: str) -> float:
    return _TASK_TEMPERATURES.get(task_type, 0.7)


class ModelRouter:
    """Routes tasks to appropriate AI models.

    Currently supports Google AI Studio (primary) and Anthropic (fallback).
    """

    def __init__(self) -> None:
        self._task_model_map: dict[str, str] = {}
        try:
            self._task_model_map = json.loads(get_settings().task_model_map)
        except (json.JSONDecodeError, TypeError):
            pass

        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=10.0,
                read=float(get_settings().job_timeout_seconds),
                write=10.0,
                pool=10.0,
            ),
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    def _select_model(self, task_type: str) -> str:
        """Returns model string for task. Override via TASK_MODEL_MAP env var (JSON)."""
        return self._task_model_map.get(task_type, get_settings().default_model)

    async def route(
        self,
        task_type: Literal["write_improvement", "follow_up", "translation", "json_repair"],
        messages: list[dict[str, str]],
        max_tokens: int = 0,
        traceparent: str | None = None,
    ) -> ModelResponse:
        """Route a task to the appropriate model via Google AI Studio.

        Args:
            task_type: Type of task for model selection and temperature.
            messages: OpenAI-compatible messages array.
            max_tokens: Maximum output tokens. 0 = use default from get_settings().
            traceparent: W3C trace context for distributed tracing.

        Returns:
            ModelResponse with content, token counts, and raw response.

        Raises:
            ModelTimeoutError: If the request times out.
            ModelRateLimitError: If rate limited (429).
            ModelError: For other API errors.
        """
        model = self._select_model(task_type)
        effective_max_tokens = max_tokens or get_settings().max_output_tokens
        # BUG-09 FIX: use task-specific temperature
        temperature = _temperature_for_task(task_type)

        headers = {
            "Authorization": f"Bearer {get_settings().google_ai_studio_api_key}",
            "Content-Type": "application/json",
        }

        # Propagate W3C trace context if available
        if traceparent:
            headers["traceparent"] = traceparent

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": effective_max_tokens,
            "temperature": temperature,
            # response_format is intentionally omitted: nvidia/nemotron-3-super does not
            # support json_object mode. JSON output is enforced via the system prompt instead.
        }

        # Retry loop with exponential backoff for 429s
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = await self._client.post(
                    f"{get_settings().google_ai_studio_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )

                if response.status_code == 429:
                    retry_after = float(
                        response.headers.get("retry-after", str(2 ** attempt))
                    )
                    if attempt < max_retries:
                        logger.warning(
                            "Rate limited by Google AI Studio, retrying in %.1fs (attempt %d/%d)",
                            retry_after,
                            attempt + 1,
                            max_retries,
                        )
                        await asyncio.sleep(retry_after)
                        continue
                    raise ModelRateLimitError(retry_after)

                if response.status_code != 200:
                    error_text = response.text[:500]
                    raise ModelError(
                        f"Google AI Studio API error {response.status_code}: {error_text}")

                data = response.json()
                choices = data.get("choices", [])
                if not choices:
                    raise ModelError(
                        "Google AI Studio returned empty choices array")

                choice = choices[0]
                content = choice.get("message", {}).get("content", "")
                finish_reason = choice.get("finish_reason", "")

                if finish_reason == "length":
                    logger.warning(
                        "Output truncated (finish_reason=length) for model %s. "
                        "Attempting to parse partial JSON.", model,)

                usage = data.get("usage", {})

                return ModelResponse(
                    content=content,
                    model=data.get("model", model),
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    finish_reason=finish_reason,
                    raw_response=data,
                )

            except httpx.TimeoutException as exc:
                if attempt < max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "Google AI Studio timeout (attempt %d/%d), retrying in %ds",
                        attempt + 1,
                        max_retries,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise ModelTimeoutError(
                    f"Google AI Studio request timed out after {get_settings().job_timeout_seconds}s") from exc

            except (httpx.HTTPError, httpx.StreamError) as exc:
                if attempt < max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "Google AI Studio HTTP error (attempt %d/%d): %s",
                        attempt + 1,
                        max_retries,
                        str(exc),
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise ModelError(
                    f"Google AI Studio HTTP error: {exc}") from exc

        # Should not reach here, but satisfy type checker
        raise ModelError("Exhausted all retries")

    async def route_stream(
        self,
        task_type: Literal["write_improvement", "follow_up", "translation", "json_repair"],
        messages: list[dict[str, str]],
        max_tokens: int = 0,
        traceparent: str | None = None,
        on_token: Callable[[str, str], Awaitable[None]] | None = None,
        model_override: str | None = None,
    ) -> ModelResponse:
        """Route with streaming enabled and invoke callback for each token chunk."""
        model = model_override or self._select_model(task_type)
        effective_max_tokens = max_tokens or get_settings().max_output_tokens
        # BUG-09 FIX: use task-specific temperature
        temperature = _temperature_for_task(task_type)

        headers = {
            "Authorization": f"Bearer {get_settings().google_ai_studio_api_key}",
            "Content-Type": "application/json",
        }
        if traceparent:
            headers["traceparent"] = traceparent

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": effective_max_tokens,
            "temperature": temperature,
            "stream": True,
        }

        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                content_chunks: list[str] = []
                finish_reason = ""
                prompt_tokens = 0
                completion_tokens = 0
                final_model = model

                async with self._client.stream(
                    "POST",
                    f"{get_settings().google_ai_studio_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code == 429:
                        retry_after = float(response.headers.get(
                            "retry-after", str(2 ** attempt)))
                        if attempt < max_retries:
                            await asyncio.sleep(retry_after)
                            continue
                        raise ModelRateLimitError(retry_after)

                    if response.status_code != 200:
                        body = await response.aread()
                        raise ModelError(
                            f"Google AI Studio stream error {response.status_code}: {body[:500].decode(errors='ignore')}"
                        )

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        payload_line = line[5:].strip()
                        if not payload_line or payload_line == "[DONE]":
                            continue

                        try:
                            item = json.loads(payload_line)
                        except json.JSONDecodeError:
                            continue

                        final_model = item.get("model", final_model)
                        usage = item.get("usage") or {}
                        prompt_tokens = int(
                            usage.get(
                                "prompt_tokens",
                                prompt_tokens) or prompt_tokens)
                        completion_tokens = int(
                            usage.get(
                                "completion_tokens",
                                completion_tokens) or completion_tokens)

                        choices = item.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0]
                        finish_reason = choice.get(
                            "finish_reason") or finish_reason
                        delta = choice.get("delta") or {}
                        chunk = delta.get("content") or ""
                        if chunk:
                            content_chunks.append(chunk)
                            if on_token:
                                await on_token(chunk, "".join(content_chunks))

                content = "".join(content_chunks)
                if not content:
                    raise ModelError(
                        "Streaming response did not include any content")

                return ModelResponse(
                    content=content,
                    model=final_model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    finish_reason=finish_reason,
                    raw_response={},
                )

            except httpx.TimeoutException as exc:
                if attempt < max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise ModelTimeoutError(
                    f"Google AI Studio streaming request timed out after {get_settings().job_timeout_seconds}s") from exc
            except (httpx.HTTPError, httpx.StreamError) as exc:
                if attempt < max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise ModelError(
                    f"Google AI Studio streaming HTTP error: {exc}") from exc

        raise ModelError("Exhausted all streaming retries")

    # F-BE-13: Anthropic fallback provider
    async def _route_anthropic(
        self,
        task_type: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        traceparent: str | None,
        on_token: Callable[[str, str], Awaitable[None]] | None,
    ) -> ModelResponse:
        """Route to Anthropic Messages API as a fallback."""
        temperature = _temperature_for_task(task_type)

        # Anthropic requires system message to be separated from messages
        system_content = ""
        filtered_messages: list[dict[str, str]] = []
        for msg in messages:
            if msg.get("role") == "system":
                system_content = msg.get("content", "")
            else:
                filtered_messages.append(msg)

        headers = {
            "x-api-key": get_settings().anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        if traceparent:
            headers["traceparent"] = traceparent

        payload: dict[str, object] = {
            "model": get_settings().anthropic_fallback_model,
            "messages": filtered_messages,
            "max_tokens": max_tokens or get_settings().max_output_tokens,
            "temperature": temperature,
        }
        if system_content:
            payload["system"] = system_content

        try:
            response = await self._client.post(
                f"{get_settings().anthropic_base_url}/messages",
                headers=headers,
                json=payload,
            )

            if response.status_code != 200:
                raise ModelError(
                    f"Anthropic API error {response.status_code}: {response.text[:500]}"
                )

            data = response.json()
            content_blocks = data.get("content", [])
            content = "".join(
                block.get("text", "") for block in content_blocks if block.get("type") == "text"
            )
            usage = data.get("usage", {})

            if on_token and content:
                await on_token(content, content)

            return ModelResponse(
                content=content,
                model=data.get("model", get_settings().anthropic_fallback_model),
                prompt_tokens=usage.get("input_tokens", 0),
                completion_tokens=usage.get("output_tokens", 0),
                finish_reason=data.get("stop_reason", ""),
                raw_response=data,
            )
        except (httpx.HTTPError, httpx.StreamError) as exc:
            raise ModelError(f"Anthropic HTTP error: {exc}") from exc

    async def route_with_fallback(
        self,
        task_type: Literal["write_improvement", "follow_up", "translation", "json_repair"],
        messages: list[dict[str, str]],
        max_tokens: int = 0,
        traceparent: str | None = None,
        on_token: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> ModelResponse:
        """Route with automatic Anthropic fallback on primary provider failure (F-BE-13)."""
        try:
            return await self.route_stream(task_type, messages, max_tokens, traceparent, on_token)
        except (ModelTimeoutError, ModelError) as primary_err:
            if get_settings().enable_anthropic_fallback and get_settings().anthropic_api_key:
                logger.warning(
                    "Primary provider failed, trying Anthropic fallback: %s",
                    str(primary_err),
                )
                return await self._route_anthropic(
                    task_type, messages, max_tokens, traceparent, on_token
                )
            raise
