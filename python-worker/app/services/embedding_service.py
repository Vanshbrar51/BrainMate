# python-worker/app/services/embedding_service.py — High-speed vector embedding generation
#
# Convers raw text into 768-dimensional vectors using Google AI Studio.
# These vectors are used for semantic retrieval in the Brand Voice RAG pipeline.

import logging
import httpx
from typing import List

from app.config import settings

logger = logging.getLogger("writeright.embedding_service")


class EmbeddingService:
    """Client for generating text embeddings via Google AI Studio."""

    def __init__(self) -> None:
        self.api_key = settings.google_ai_studio_api_key
        # Deriving the base URL for the native Google AI Studio API (non-OpenAI)
        # OpenAI: .../v1beta/openai
        # Native: .../v1beta/models/{model}:embedContent
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self._client = httpx.AsyncClient(timeout=10.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def get_embedding(self, text: str) -> List[float]:
        """Generate an embedding for a single piece of text.

        Returns:
            List of 768 floats (standard for text-embedding-004).
        """
        model = settings.embedding_model
        url = f"{self.base_url}/models/{model}:embedContent?key={self.api_key}"

        payload = {
            "model": f"models/{model}",
            "content": {
                "parts": [{"text": text}]
            }
        }

        try:
            response = await self._client.post(url, json=payload)
            
            if response.status_code != 200:
                logger.error(
                    "Embedding API error %d: %s", 
                    response.status_code, 
                    response.text[:500]
                )
                response.raise_for_status()

            data = response.json()
            embedding = data.get("embedding", {}).get("values", [])
            
            if not embedding:
                logger.error("Embedding API returned empty values: %s", data)
                raise ValueError("Empty embedding returned from API")

            return embedding

        except Exception as e:
            logger.exception("Failed to generate embedding for text")
            raise


# Singleton instance
_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Returns the singleton EmbeddingService instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


async def close_embedding_service() -> None:
    """Closes the singleton EmbeddingService client."""
    global _embedding_service
    if _embedding_service:
        await _embedding_service.close()
        _embedding_service = None
