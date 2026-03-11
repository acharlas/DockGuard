from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ScanResult


@pytest.mark.asyncio
async def test_create_scan_returns_202(client: AsyncClient):
    resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
    assert resp.status_code == 202
    data = resp.json()
    assert data["image_name"] == "nginx:latest"
    assert data["scan_status"] == "pending"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_scan_rejects_malicious_input(client: AsyncClient):
    resp = await client.post(
        "/api/v1/scans", json={"image": "; rm -rf /"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_scans_empty(client: AsyncClient):
    resp = await client.get("/api/v1/scans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_scans_with_data(
    client: AsyncClient, db_session: AsyncSession
):
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
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(ScanResult(image_name="alpine:3.19", scan_status="completed"))
    db_session.add(ScanResult(image_name="nginx:latest", scan_status="pending"))
    await db_session.commit()

    resp = await client.get("/api/v1/scans?status=completed")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["scan_status"] == "completed"


@pytest.mark.asyncio
async def test_list_scans_filter_by_date(
    client: AsyncClient, db_session: AsyncSession
):
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
    client: AsyncClient, db_session: AsyncSession, trivy_report
):
    scan = ScanResult(
        image_name="nginx:latest",
        scan_status="completed",
        summary={"critical": 1, "high": 1, "medium": 1, "low": 1},
        raw_report=trivy_report,
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    resp = await client.get(f"/api/v1/scans/{scan.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["image_name"] == "nginx:latest"
    assert len(data["vulnerabilities"]) == 4
    assert data["vulnerabilities"][0]["vuln_id"] == "CVE-2024-0001"


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
async def test_cancel_completed_scan_returns_409(
    client: AsyncClient, db_session: AsyncSession
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
