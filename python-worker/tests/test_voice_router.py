import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch
import json

from app.models.job import VoiceIngestRequest, VoiceListResponse, VoiceExample
from app.services.embedding_service import EmbeddingService

# Test cases for the /voice endpoint
@pytest.mark.asyncio
async def test_voice_ingest_unauthorized(client: AsyncClient):
    response = await client.post("/voice/ingest", json={"content": "test", "user_id": "123"})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_voice_ingest_empty_content(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    response = await client.post("/voice/ingest", json={"content": "", "user_id": "123"}, headers=headers)
    assert response.status_code == 400
    assert "Content cannot be empty" in response.json()["detail"]

@pytest.mark.asyncio
async def test_voice_ingest_success(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    request_data = {"content": "This is a brand voice example.", "user_id": "user_123"}
    
    # Mock embedding service and supabase client
    with patch("app.routers.voice.get_embedding_service") as mock_get_emb, \
         patch("app.routers.voice.save_voice_example", new_callable=AsyncMock) as mock_save:
        
        # get_embedding_service() returns the singleton instance
        mock_emb_service = AsyncMock(spec=EmbeddingService)
        mock_emb_service.get_embedding.return_value = [0.1] * 768
        mock_get_emb.return_value = mock_emb_service
        
        response = await client.post("/voice/ingest", json=request_data, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        mock_save.assert_called_once()
        mock_emb_service.get_embedding.assert_called_with("This is a brand voice example.")

@pytest.mark.asyncio
async def test_voice_list_success(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    user_id = "user_123"
    
    mock_examples = [
        {"id": "1", "content": "Example 1", "created_at": "2023-01-01T00:00:00Z"},
        {"id": "2", "content": "Example 2", "created_at": "2023-01-02T00:00:00Z"},
    ]
    
    with patch("app.routers.voice.get_voice_examples", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_examples
        
        # Fixed URL: changed /voice to /voice/examples
        response = await client.get(f"/voice/examples?user_id={user_id}", headers=headers)
        
        assert response.status_code == 200
        parsed = VoiceListResponse.model_validate(response.json())
        assert len(parsed.examples) == 2
        assert parsed.examples[0].content == "Example 1"

@pytest.mark.asyncio
async def test_voice_delete_success(client: AsyncClient):
    headers = {"X-Internal-API-Token": "test-token"}
    user_id = "user_123"
    example_id = "1"
    
    with patch("app.routers.voice.delete_voice_example", new_callable=AsyncMock) as mock_delete:
        # Fixed URL: changed /voice/{id} to /voice/examples/{id}
        response = await client.delete(f"/voice/examples/{example_id}?user_id={user_id}", headers=headers)
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        mock_delete.assert_called_once_with(user_id, example_id)
