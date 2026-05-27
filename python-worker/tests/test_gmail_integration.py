import pytest
from unittest.mock import AsyncMock, patch
from app.models.job import WritingJob, ModelResponse
from app.config import Settings
from app.services.ai_worker import _has_gmail_retrieval_intent, _generate_draft


def test_has_gmail_retrieval_intent():
    # True cases
    assert _has_gmail_retrieval_intent("summarise the latest mail in my gmail") is True
    assert _has_gmail_retrieval_intent("tell me what is in my latest email") is True
    assert _has_gmail_retrieval_intent("what are my recent messages in gmail?") is True
    assert _has_gmail_retrieval_intent("read my inbox") is True

    # False cases
    assert _has_gmail_retrieval_intent("write a professional email to boss") is False
    assert _has_gmail_retrieval_intent("how to connect gmail to my account?") is False
    assert _has_gmail_retrieval_intent("I want to disconnect my gmail connection") is False
    assert _has_gmail_retrieval_intent("general writing query about python code") is False


@pytest.mark.asyncio
async def test_generate_draft_with_gmail_connected():
    job = WritingJob(
        id="job-id-123",
        chatId="chat-id-123",
        userId="user-id-123",
        messageId="msg-id-123",
        content="please summarize my latest gmail emails",
        tone="Professional",
        mode="email",
    )

    mock_settings = Settings(
        internal_api_token="test-token",
        supabase_url="http://mock-db",
        supabase_service_key="mock-key",
        google_ai_studio_api_key="mock-api-key"
    )

    mock_emails = {
        "emails": [
            {
                "id": "msg-1",
                "sender_name": "Boss",
                "sender_email": "boss@work.com",
                "subject": "Important update",
                "snippet": "We need the slide deck by EOD.",
                "body_plain": "Hi team, we need the slide deck by EOD.",
                "timestamp": "2026-05-27T12:00:00Z"
            }
        ]
    }

    with patch("app.services.gmail_client.GmailClient.get_connection_status", new_callable=AsyncMock) as mock_status, \
         patch("app.services.gmail_client.GmailClient.fetch_recent_emails", new_callable=AsyncMock) as mock_fetch, \
         patch("app.services.ai_worker.build_messages") as mock_build, \
         patch("app.services.ai_worker.get_model_router") as mock_get_router:

        mock_status.return_value = {"connected": True}
        mock_fetch.return_value = mock_emails

        mock_router = AsyncMock()
        # Mock route_stream to return a successful ModelResponse containing valid JSON
        mock_router.route_stream.return_value = ModelResponse(
            content='{"improved_text":"Summary of email","teaching":{"mistakes":[],"better_versions":[],"explanations":[]},"follow_up":"","suggestions":[],"scores":{"clarity":9,"tone":9,"impact":9,"verdict":"Ready to send"}}',
            model="gemini-2.5-flash",
            prompt_tokens=10,
            completion_tokens=10
        )
        mock_router.route.return_value = ModelResponse(
            content='{"improved_text":"Summary of email","teaching":{"mistakes":[],"better_versions":[],"explanations":[]},"follow_up":"","suggestions":[],"scores":{"clarity":9,"tone":9,"impact":9,"verdict":"Ready to send"}}',
            model="gemini-2.5-flash",
            prompt_tokens=10,
            completion_tokens=10
        )
        mock_get_router.return_value = mock_router

        mock_build.return_value = ([], {})

        await _generate_draft(
            job=job,
            settings_instance=mock_settings,
            history=[],
            profile=[],
        )

        # Verify status and fetch are called
        mock_status.assert_called_once_with("user-id-123")
        mock_fetch.assert_called_once_with("user-id-123", max_results=5)

        # Verify prompt builder is called with the injected gmail_context
        called_kwargs = mock_build.call_args[1]
        assert "gmail_context" in called_kwargs
        assert "The user's Gmail account is connected" in called_kwargs["gmail_context"]
        assert "Important update" in called_kwargs["gmail_context"]
        assert "Boss" in called_kwargs["gmail_context"]
