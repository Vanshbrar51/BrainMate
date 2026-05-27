# python-worker/app/services/gmail_client.py — Gmail client for Rust gateway
#
# Interfaces with the secure internal Gmail endpoints exposed by the Rust gateway.
# Passes the internal API token for authentication.

import logging
import httpx
from typing import Any
from app.config import get_settings

logger = logging.getLogger("writeright.gmail_client")


class GmailClient:
    """Client for calling internal Gmail endpoints on the Rust Auth Gateway."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def get_connection_status(self, user_id: str) -> dict[str, Any]:
        """Check if the user has an active Gmail connection via Rust gateway.

        Returns:
            dict containing {"connected": bool, "connection": dict | None}
        """
        url = f"{self.settings.auth_gateway_internal_url}/v1/gmail/status/{user_id}"
        headers = {
            "x-internal-api-token": self.settings.internal_api_token
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return response.json()
                logger.warning(
                    "gmail_status_failed",
                    extra={"user_id": user_id, "status": response.status_code}
                )
                return {"connected": False, "connection": None}
            except Exception as e:
                logger.error(
                    "gmail_status_error",
                    extra={"user_id": user_id, "error": str(e)}
                )
                raise ConnectionError("Auth gateway offline") from e

    async def fetch_recent_emails(self, user_id: str, max_results: int = 5) -> dict[str, Any]:
        """Fetch user's recent emails from Rust gateway.

        Returns:
            dict containing {"emails": list, "next_page_token": str | None, "total_estimate": int}
        """
        url = f"{self.settings.auth_gateway_internal_url}/v1/gmail/emails/{user_id}"
        headers = {
            "x-internal-api-token": self.settings.internal_api_token
        }
        params = {
            "max_results": max_results,
            "unread_only": "false",
            "label": "INBOX"
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(url, headers=headers, params=params)
                if response.status_code == 200:
                    return response.json()
                logger.warning(
                    "gmail_fetch_emails_failed",
                    extra={"user_id": user_id, "status": response.status_code}
                )
                return {"emails": [], "next_page_token": None, "total_estimate": 0}
            except Exception as e:
                logger.error(
                    "gmail_fetch_emails_error",
                    extra={"user_id": user_id, "error": str(e)}
                )
                raise ConnectionError("Auth gateway offline") from e
