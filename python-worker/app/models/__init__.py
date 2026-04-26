# python-worker/app/models/__init__.py
"""Pydantic models for WriteRight AI jobs and results."""

from .job import WritingJob, AIResult, TeachingBlock, ModelResponse

__all__ = ["WritingJob", "AIResult", "TeachingBlock", "ModelResponse"]
