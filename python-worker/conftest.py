# python-worker/conftest.py
import pytest
from unittest.mock import patch, AsyncMock

# This fixture will ensure that app.config.settings is mocked for all tests.
# It patches the module-level 'settings' object in app/config.py
# This is crucial because 'settings' is a singleton loaded at import time.
@pytest.fixture(scope="session", autouse=True)
def mock_global_settings():
    with patch("app.config.settings", AsyncMock()) as mock_s:
        # Provide mock values for required settings
        mock_s.internal_api_token = "test-token"
        mock_s.supabase_url = "http://mock.supabase.url"
        mock_s.supabase_service_key = "mock-supabase-key"
        mock_s.google_ai_studio_api_key = "mock-google-key"
        mock_s.embedding_model = "mock-embedding-model"
        # Add other required settings here if needed
        yield mock_s
