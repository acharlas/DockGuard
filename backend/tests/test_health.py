from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


def _mock_trivy_healthy(*args, **kwargs):
    """Return a mock process with returncode 0 (Trivy available)."""
    proc = AsyncMock()
    proc.returncode = 0
    proc.wait = AsyncMock(return_value=0)
    return proc


@pytest.mark.asyncio
async def test_health_returns_all_components(client: AsyncClient):
    with patch(
        "app.api.routes.health.asyncio.create_subprocess_exec",
        AsyncMock(side_effect=_mock_trivy_healthy),
    ):
        resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "database" in data
    assert "redis" in data
    assert "trivy" in data


@pytest.mark.asyncio
async def test_health_redis_unavailable_still_200(client: AsyncClient):
    with (
        patch(
            "app.api.routes.health._get_client",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.api.routes.health.asyncio.create_subprocess_exec",
            AsyncMock(side_effect=_mock_trivy_healthy),
        ),
    ):
        resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["redis"] == "unavailable"
    assert data["status"] == "healthy"
