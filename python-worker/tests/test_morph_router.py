import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock
import asyncio

from app.models.job import MorphRequest

# Test cases for the /morph endpoint
@pytest.mark.asyncio
async def test_morph_endpoint_unauthorized(client: AsyncClient):
    response = await client.post("/morph", json={
        "original_text": "hello",
        "current_text": "hello",
        "tone": "Professional",
        "intensity": 3,
        "mode": "email"
    })
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_morph_endpoint_success(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    request_data = {
        "original_text": "Hi there",
        "current_text": "Hello, how are you?",
        "tone": "Formal",
        "intensity": 5,
        "mode": "email"
    }

    # Mock ModelRouter.route_stream to simulate token streaming
    async def mock_route_stream(*args, **kwargs):
        on_token = kwargs.get("on_token")
        if on_token:
            await on_token("Morphed", "Morphed")
            await on_token(" text", "Morphed text")

    with patch("app.routers.morph.get_model_router") as mock_get_router:
        mock_router = AsyncMock()
        mock_router.route_stream.side_effect = mock_route_stream
        mock_get_router.return_value = mock_router

        async with client.stream("POST", "/morph", json=request_data, headers=headers) as response:
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/plain; charset=utf-8"
            
            chunks = []
            async for chunk in response.aiter_text():
                chunks.append(chunk)
            
            full_text = "".join(chunks)
            assert full_text == "Morphed text"
            mock_router.route_stream.assert_called_once()

@pytest.mark.asyncio
async def test_morph_endpoint_error_handling(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    request_data = {
        "original_text": "Hi there",
        "current_text": "Hello",
        "tone": "Formal",
        "intensity": 3,
        "mode": "email"
    }

    with patch("app.routers.morph.get_model_router") as mock_get_router:
        mock_router = AsyncMock()
        mock_router.route_stream.side_effect = Exception("AI failed")
        mock_get_router.return_value = mock_router

        async with client.stream("POST", "/morph", json=request_data, headers=headers) as response:
            assert response.status_code == 200 # StreamingResponse often starts with 200
            
            chunks = []
            async for chunk in response.aiter_text():
                chunks.append(chunk)
            
            full_text = "".join(chunks)
            assert "Error: AI failed" in full_text
