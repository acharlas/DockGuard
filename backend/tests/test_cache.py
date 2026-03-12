"""Tests for Redis-backed digest cache."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ScanResult
from app.services import cache as cache_module

DIGEST = "sha256:" + ("b" * 64)


@pytest.fixture
def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.mark.asyncio
async def test_cache_miss_returns_none(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        result = await cache_module.get_cached_scan_id_for_digest(DIGEST)
    assert result is None


@pytest.mark.asyncio
async def test_cache_set_and_hit(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result(DIGEST, 42)
        result = await cache_module.get_cached_scan_id_for_digest(DIGEST)
    assert result == 42


@pytest.mark.asyncio
async def test_cache_ttl_set(fake_redis):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result(DIGEST, 7)
        ttl = await fake_redis.ttl(f"dockguard:scan:digest:{DIGEST}")
    assert 590 <= ttl <= 600


@pytest.mark.asyncio
async def test_cache_disabled_when_redis_unavailable():
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=None)):
        result = await cache_module.get_cached_scan_id_for_digest(DIGEST)
        assert result is None
        await cache_module.cache_scan_result(DIGEST, 1)


@pytest.mark.asyncio
async def test_post_scan_returns_cached_digest_result(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
    fake_redis,
):
    existing = ScanResult(
        image_name="nginx:latest",
        image_digest=DIGEST,
        scan_status="completed",
        summary={"critical": 1, "high": 1, "medium": 1, "low": 1},
        raw_report=trivy_report,
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result(existing.image_digest, existing.id)
        resp = await client.post(
            "/api/v1/scans",
            json={"image": f"nginx@{DIGEST}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == existing.id
    assert data["scan_status"] == "completed"


@pytest.mark.asyncio
async def test_post_scan_creates_new_for_mutable_tag_even_if_digest_is_cached(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
    fake_redis,
):
    existing = ScanResult(
        image_name="nginx:latest",
        image_digest=DIGEST,
        scan_status="completed",
        summary={"critical": 1, "high": 1, "medium": 1, "low": 1},
        raw_report=trivy_report,
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result(existing.image_digest, existing.id)
        resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})

    assert resp.status_code == 202
    data = resp.json()
    assert data["id"] != existing.id
    assert data["scan_status"] == "pending"


@pytest.mark.asyncio
async def test_post_scan_ignores_stale_digest_cache_if_scan_missing(
    client: AsyncClient,
    fake_redis,
):
    with patch.object(cache_module, "_get_client", AsyncMock(return_value=fake_redis)):
        await cache_module.cache_scan_result(DIGEST, 9999)
        resp = await client.post(
            "/api/v1/scans",
            json={"image": f"ghost@{DIGEST}"},
        )

    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_status"] == "pending"
