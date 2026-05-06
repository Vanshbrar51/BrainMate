import os
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock, MagicMock

# Set required environment variables BEFORE importing app code
os.environ["INTERNAL_API_TOKEN"] = "test-token"
os.environ["SUPABASE_URL"] = "http://mock.supabase.url"
os.environ["SUPABASE_SERVICE_KEY"] = "mock-supabase-key"
os.environ["GOOGLE_AI_STUDIO_API_KEY"] = "mock-google-key"
os.environ["OTEL_ENDPOINT"] = "" # Disable OTel in tests

# DO NOT mock settings globally, use the environment variables
# This avoids MagicMock serialization issues.

@pytest.fixture(scope="session")
def app():
    # Ensure settings are loaded with our env vars
    from app.config import get_settings
    get_settings() # Initialize settings
    from main import app
    return app

@pytest_asyncio.fixture
async def client(app):
    from httpx import AsyncClient, ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
