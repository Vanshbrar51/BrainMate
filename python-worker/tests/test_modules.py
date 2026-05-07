import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock
from main import app

client = TestClient(app)

def test_unauthorized_access():
    response = client.post("/dev-helper", json={"prompt": "test"})
    assert response.status_code == 401

def test_dev_helper_mock():
    # Mocking the actual AI generation to test the router logic
    with patch("app.services.model_router.ModelRouter.route_with_fallback") as mock_gen:
        mock_gen.return_value = Mock(content="Root cause: Test error")
        
        # Use 'test-token' from conftest.py
        response = client.post(
            "/dev-helper", 
            json={"prompt": "test error"},
            headers={"X-Internal-API-Token": "test-token"}
        )
        assert response.status_code == 200
        assert response.json()["content"] == "Root cause: Test error"

def test_study_mate_mock():
    with patch("app.services.model_router.ModelRouter.route_with_fallback") as mock_gen:
        mock_gen.return_value = Mock(content="Step 1: Learn")
        
        # Use 'test-token' from conftest.py
        response = client.post(
            "/study-mate", 
            json={"prompt": "learn math"},
            headers={"X-Internal-API-Token": "test-token"}
        )
        assert response.status_code == 200
        assert response.json()["content"] == "Step 1: Learn"
