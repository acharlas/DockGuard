import pytest
from httpx import AsyncClient

from app.tasks import _shutdown_event


@pytest.mark.asyncio
async def test_post_scans_returns_503_during_shutdown(client: AsyncClient):
    _shutdown_event.set()
    try:
        resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
        assert resp.status_code == 503
        assert "shutting down" in resp.json()["detail"].lower()
    finally:
        _shutdown_event.clear()
