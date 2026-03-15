import asyncio
import copy
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.main import app
from app.models.scan import ScanResult

DIGEST = "sha256:" + ("b" * 64)


@pytest.mark.asyncio
async def test_create_scan_returns_202(client: AsyncClient):
    resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
    assert resp.status_code == 202
    data = resp.json()
    assert data["image_name"] == "nginx:latest"
    assert data["scan_status"] == "pending"
    assert data["started_at"] is None
    assert "id" in data


@pytest.mark.asyncio
async def test_create_scan_returns_existing_active_scan(
    client: AsyncClient,
    db_session: AsyncSession,
):
    existing = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
    assert resp.status_code == 200  # 200 = existing scan returned, not a new one
    assert resp.json()["id"] == existing.id


@pytest.mark.asyncio
async def test_create_scan_returns_200_for_completed_cached_digest_hit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cached = ScanResult(
        image_name=f"nginx@{DIGEST}",
        image_digest=DIGEST,
        scan_status="completed",
    )
    db_session.add(cached)
    await db_session.commit()
    await db_session.refresh(cached)

    with patch(
        "app.api.routes.scans.get_cached_scan_id_for_digest",
        AsyncMock(return_value=cached.id),
    ):
        resp = await client.post("/api/v1/scans", json={"image": f"nginx@{DIGEST}"})

    assert resp.status_code == 200
    assert resp.json()["id"] == cached.id

    total = (
        await db_session.execute(select(func.count()).select_from(ScanResult))
    ).scalar_one()
    assert total == 1


@pytest.mark.asyncio
async def test_create_scan_deduplicates_concurrent_requests(
    client: AsyncClient,
    session_factory,
):
    responses = await asyncio.gather(
        client.post("/api/v1/scans", json={"image": "nginx:latest"}),
        client.post("/api/v1/scans", json={"image": "nginx:latest"}),
    )

    # One request creates the scan (202), the other deduplicates it (200).
    assert all(resp.status_code in (200, 202) for resp in responses)
    assert len({resp.json()["id"] for resp in responses}) == 1

    async with session_factory() as session:
        count = (
            await session.execute(
                select(func.count())
                .select_from(ScanResult)
                .where(ScanResult.image_name == "nginx:latest")
            )
        ).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_create_scan_rejects_malicious_input(client: AsyncClient):
    resp = await client.post("/api/v1/scans", json={"image": "; rm -rf /"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_scan_returns_429_when_queue_is_full(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    monkeypatch.setattr(settings, "max_pending_scans", 1)

    db_session.add(ScanResult(image_name="busy:latest", scan_status="pending"))
    await db_session.commit()

    resp = await client.post("/api/v1/scans", json={"image": "other:latest"})
    assert resp.status_code == 429
    assert resp.json()["detail"] == "Scan queue is full. Try again later."


@pytest.mark.asyncio
async def test_app_startup_reconciles_interrupted_scans(db_session: AsyncSession):
    pending_scan = ScanResult(image_name="pending:latest", scan_status="pending")
    running_scan = ScanResult(
        image_name="running:latest",
        scan_status="running",
        started_at=datetime.now(timezone.utc),
    )
    db_session.add_all([pending_scan, running_scan])
    await db_session.commit()

    async with app.router.lifespan_context(app):
        pass

    await db_session.refresh(pending_scan)
    await db_session.refresh(running_scan)

    assert pending_scan.scan_status == "failed"
    assert pending_scan.failure_reason == "worker_restarted"
    assert pending_scan.completed_at is not None
    assert running_scan.scan_status == "failed"
    assert running_scan.failure_reason == "worker_restarted"
    assert running_scan.completed_at is not None


@pytest.mark.asyncio
async def test_list_scans_empty(client: AsyncClient):
    resp = await client.get("/api/v1/scans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_scans_with_data(client: AsyncClient, db_session: AsyncSession):
    db_session.add(ScanResult(image_name="alpine:3.19", scan_status="completed"))
    db_session.add(ScanResult(image_name="nginx:latest", scan_status="pending"))
    await db_session.commit()

    resp = await client.get("/api/v1/scans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_scans_filter_by_status(
    client: AsyncClient,
    db_session: AsyncSession,
):
    db_session.add(ScanResult(image_name="alpine:3.19", scan_status="completed"))
    db_session.add(ScanResult(image_name="nginx:latest", scan_status="pending"))
    await db_session.commit()

    resp = await client.get("/api/v1/scans?status=completed")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["scan_status"] == "completed"


@pytest.mark.asyncio
async def test_list_scans_filter_by_date(client: AsyncClient, db_session: AsyncSession):
    old = ScanResult(
        image_name="old:1.0",
        scan_status="completed",
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    recent = ScanResult(
        image_name="new:2.0",
        scan_status="completed",
        created_at=datetime(2026, 3, 10, tzinfo=timezone.utc),
    )
    db_session.add_all([old, recent])
    await db_session.commit()

    resp = await client.get("/api/v1/scans?date_from=2026-01-01T00:00:00")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["image_name"] == "new:2.0"

    resp = await client.get("/api/v1/scans?date_to=2025-12-31T23:59:59")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["image_name"] == "old:1.0"


@pytest.mark.asyncio
async def test_get_scan_detail(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
    dive_report,
):
    scan = ScanResult(
        image_name="nginx:latest",
        image_digest=DIGEST,
        scan_status="completed",
        build_status="completed",
        build_summary={
            "image_size_bytes": 205000000,
            "efficiency_score": 0.87,
            "wasted_bytes": 18450000,
            "wasted_percent": 9.0,
            "layer_count": 4,
            "inefficient_layer_count": 2,
        },
        build_report={"layers": dive_report["layers"][:2]},
        summary={"critical": 1, "high": 1, "medium": 1, "low": 1, "unknown": 0},
        raw_report=trivy_report,
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    resp = await client.get(f"/api/v1/scans/{scan.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["image_name"] == "nginx:latest"
    assert data["image_digest"] == DIGEST
    assert data["build_status"] == "completed"
    assert len(data["vulnerabilities"]) == 4
    assert data["vulnerabilities"][0]["vuln_id"] == "CVE-2024-0001"
    assert data["build"]["status"] == "completed"
    assert data["build"]["summary"]["efficiency_score"] == 0.87
    assert data["build"]["report"]["layers"][0]["layer_id"] == "sha256:layer-1"


@pytest.mark.asyncio
async def test_get_scan_not_found(client: AsyncClient):
    resp = await client.get("/api/v1/scans/9999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_pending_scan(client: AsyncClient, db_session: AsyncSession):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    resp = await client.post(f"/api/v1/scans/{scan.id}/cancel")
    assert resp.status_code == 200
    assert resp.json()["scan_status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_running_scan_records_intent_without_lying(
    client: AsyncClient,
    db_session: AsyncSession,
):
    scan = ScanResult(
        image_name="nginx:latest",
        scan_status="running",
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with patch("app.api.routes.scans.cancel_scan", AsyncMock()) as cancel_mock:
        resp = await client.post(f"/api/v1/scans/{scan.id}/cancel")

    await db_session.refresh(scan)

    assert resp.status_code == 200
    assert resp.json()["scan_status"] == "running"
    assert scan.cancel_requested_at is not None
    assert scan.completed_at is None
    cancel_mock.assert_awaited_once_with(scan.id)


@pytest.mark.asyncio
async def test_cancel_completed_scan_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="completed")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    resp = await client.post(f"/api/v1/scans/{scan.id}/cancel")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_cancel_nonexistent_scan_returns_404(client: AsyncClient):
    resp = await client.post("/api/v1/scans/9999/cancel")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health_returns_503_when_db_is_unavailable(
    client: AsyncClient,
):
    async def broken_get_db():
        class BrokenSession:
            async def execute(self, *_args, **_kwargs):
                raise RuntimeError("db down")

        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_get_db
    try:
        resp = await client.get("/api/v1/health")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 503
    assert resp.json() == {"status": "degraded", "database": "unhealthy"}


@pytest.mark.asyncio
async def test_stats_empty(client: AsyncClient):
    resp = await client.get("/api/v1/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_scans"] == 0
    assert data["completed_scans"] == 0
    assert data["failed_scans"] == 0
    assert data["severity_breakdown"] == {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "unknown": 0,
    }
    assert data["build_breakdown"] == {
        "completed": 0,
        "failed": 0,
        "unavailable": 0,
    }
    assert data["avg_efficiency_score"] is None
    assert data["total_wasted_bytes"] == 0
    assert data["top_cves"] == []
    assert data["top_images"] == []


@pytest.mark.asyncio
async def test_stats_aggregates_completed_scans(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
):
    for image in ("nginx:latest", "nginx:latest", "alpine:3.18"):
        scan = ScanResult(
            image_name=image,
            scan_status="completed",
            build_status="completed",
            build_summary={
                "image_size_bytes": 205000000,
                "efficiency_score": 0.87,
                "wasted_bytes": 18450000,
                "wasted_percent": 9.0,
                "layer_count": 4,
                "inefficient_layer_count": 2,
            },
            summary={"critical": 1, "high": 1, "medium": 1, "low": 1},
            raw_report=trivy_report,
        )
        db_session.add(scan)
    db_session.add(ScanResult(image_name="bad:image", scan_status="failed"))
    db_session.add(
        ScanResult(
            image_name="socketless:image",
            scan_status="completed",
            build_status="unavailable",
            build_failure_reason="docker_unavailable",
            summary={"critical": 0, "high": 0, "medium": 0, "low": 0, "unknown": 0},
        )
    )
    await db_session.commit()

    resp = await client.get("/api/v1/stats")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_scans"] == 5
    assert data["completed_scans"] == 4
    assert data["failed_scans"] == 1
    assert data["severity_breakdown"]["critical"] == 3
    assert data["severity_breakdown"]["high"] == 3
    assert data["build_breakdown"] == {
        "completed": 3,
        "failed": 0,
        "unavailable": 1,
    }
    assert data["avg_efficiency_score"] == 0.87
    assert data["total_wasted_bytes"] == 55350000
    assert len(data["top_cves"]) == 4
    assert data["top_cves"][0]["count"] == 3
    assert data["top_images"][0] == {"image_name": "nginx:latest", "scan_count": 2}


@pytest.mark.asyncio
async def test_stats_top_cves_include_all_completed_scans(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
):
    repeated_report = copy.deepcopy(trivy_report)
    repeated_report["Results"][0]["Vulnerabilities"] = [
        {
            "VulnerabilityID": "CVE-2026-0001",
            "PkgName": "openssl",
            "InstalledVersion": "1.0.0",
            "FixedVersion": "1.0.1",
            "Severity": "HIGH",
            "Title": "Repeated across all scans",
        }
    ]

    for index in range(101):
        db_session.add(
            ScanResult(
                image_name=f"image-{index}:latest",
                scan_status="completed",
                summary={
                    "critical": 0,
                    "high": 1,
                    "medium": 0,
                    "low": 0,
                    "unknown": 0,
                },
                raw_report=copy.deepcopy(repeated_report),
            )
        )
    await db_session.commit()

    resp = await client.get("/api/v1/stats")
    assert resp.status_code == 200
    data = resp.json()

    assert data["top_cves"][0]["vuln_id"] == "CVE-2026-0001"
    # Default limit is 100: only the 100 most recent scans are aggregated.
    assert data["top_cves"][0]["count"] == 100


@pytest.mark.asyncio
async def test_create_scan_dedup_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Deduplication path returns 200, not 202, to distinguish it from a new scan."""
    existing = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
    assert resp.status_code == 200
    assert resp.json()["id"] == existing.id


@pytest.mark.asyncio
async def test_stats_cve_query_respects_recent_scan_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    trivy_report,
):
    """get_stats aggregates only the N most recent completed scans for the CVE list."""
    # Insert 5 scans each with a unique CVE
    import copy
    for i in range(5):
        report = copy.deepcopy(trivy_report)
        report["Results"][0]["Vulnerabilities"] = [
            {
                "VulnerabilityID": f"CVE-LIMIT-{i:04d}",
                "PkgName": "pkg",
                "InstalledVersion": "1.0",
                "Severity": "HIGH",
                "Title": f"test vuln {i}",
            }
        ]
        db_session.add(
            ScanResult(
                image_name=f"img{i}:latest",
                scan_status="completed",
                summary={"critical": 0, "high": 1, "medium": 0, "low": 0, "unknown": 0},
                raw_report=report,
            )
        )
    await db_session.commit()

    # With limit=2 only the 2 most recently inserted scans contribute CVEs
    original = settings.stats_recent_scan_limit
    settings.stats_recent_scan_limit = 2
    try:
        resp = await client.get("/api/v1/stats")
        assert resp.status_code == 200
        cve_ids = {cve["vuln_id"] for cve in resp.json()["top_cves"]}
        assert len(cve_ids) == 2
        # The two most recent scans have CVE-LIMIT-0003 and CVE-LIMIT-0004
        assert "CVE-LIMIT-0003" in cve_ids
        assert "CVE-LIMIT-0004" in cve_ids
    finally:
        settings.stats_recent_scan_limit = original
