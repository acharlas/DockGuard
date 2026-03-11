"""Tests for Redis scan result cache.

Uses fakeredis to exercise real cache logic without a running Redis instance.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ScanResult
from app.services import cache as cache_module


@pytest.fixture(autouse=True)
def reset_cache_client():
    """Reset the module-level Redis client between tests."""
    cache_module._client = None
    yield
    cache_module._client = None


@pytest.fixture
def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.mark.asyncio
async def test_cache_miss_returns_none(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        result = await cache_module.get_cached_scan_id("nginx:latest")
    assert result is None


@pytest.mark.asyncio
async def test_cache_set_and_hit(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result("nginx:latest", 42)
        result = await cache_module.get_cached_scan_id("nginx:latest")
    assert result == 42


@pytest.mark.asyncio
async def test_cache_ttl_set(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result("alpine:3.18", 7)
        ttl = await fake_redis.ttl("dockguard:scan:alpine:3.18")
    # TTL should be set close to CACHE_TTL (600s)
    assert 590 <= ttl <= 600


@pytest.mark.asyncio
async def test_cache_disabled_when_redis_unavailable():
    """When Redis is unreachable, get/set are no-ops (no exception raised)."""
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=None)):
        result = await cache_module.get_cached_scan_id("nginx:latest")
        assert result is None

        # Should not raise
        await cache_module.cache_scan_result("nginx:latest", 1)


@pytest.mark.asyncio
async def test_post_scan_returns_cached_result(
    client: AsyncClient, db_session: AsyncSession, trivy_report, fake_redis
):
    """POST /scans with a cached image returns the existing completed scan."""
    existing = ScanResult(
        image_name="nginx:latest",
        scan_status="completed",
        summary={"critical": 1, "high": 1, "medium": 1, "low": 1},
        raw_report=trivy_report,
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        # Populate cache
        await cache_module.cache_scan_result("nginx:latest", existing.id)

        # POST scan — should return the cached scan without creating a new one
        resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})

    assert resp.status_code == 202
    data = resp.json()
    assert data["id"] == existing.id
    assert data["scan_status"] == "completed"


@pytest.mark.asyncio
async def test_post_scan_creates_new_on_cache_miss(client: AsyncClient, fake_redis):
    """POST /scans with no cached entry creates a new scan normally."""
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        resp = await client.post("/api/v1/scans", json={"image": "alpine:latest"})

    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_status"] == "pending"


@pytest.mark.asyncio
async def test_post_scan_ignores_stale_cache_if_scan_missing(
    client: AsyncClient, fake_redis
):
    """If cache points to a deleted/missing scan, fall through to new scan."""
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result("ghost:latest", 9999)
        resp = await client.post("/api/v1/scans", json={"image": "ghost:latest"})

    assert resp.status_code == 202
    data = resp.json()
    # New pending scan was created, not the missing cached one
    assert data["scan_status"] == "pending"
