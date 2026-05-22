import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import get_db
from app.main import app
from app.models.scan import ScanResult, ScanStatus
from app.services import scanner as scanner_module
from app.services.dive import BuildAnalysisResult

FIXTURES = Path(__file__).parent / "fixtures"
POSTGRES_TEST_DATABASE_URL = os.getenv("POSTGRES_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not POSTGRES_TEST_DATABASE_URL,
    reason="POSTGRES_TEST_DATABASE_URL is not configured",
)


@pytest.fixture
async def postgres_session_factory():
    assert POSTGRES_TEST_DATABASE_URL is not None
    engine = create_async_engine(POSTGRES_TEST_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE scan_results RESTART IDENTITY"))

    yield session_factory

    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE scan_results RESTART IDENTITY"))
    await engine.dispose()


@pytest.mark.asyncio
async def test_postgres_stats_nullable_started_at_and_build_metrics(
    postgres_session_factory,
):
    trivy_report = json.loads((FIXTURES / "trivy_nginx.json").read_text())

    async with postgres_session_factory() as session:
        session.add_all(
            [
                ScanResult(
                    image_name="nginx:latest",
                    scan_status="pending",
                    started_at=None,
                ),
                ScanResult(
                    image_name="alpine:3.19",
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
                    summary={
                        "critical": 2,
                        "high": 1,
                        "medium": 0,
                        "low": 0,
                        "unknown": 0,
                    },
                    raw_report=trivy_report,
                ),
            ]
        )
        await session.commit()

    async def override_get_db():
        async with postgres_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            scans_resp = await client.get("/api/v1/scans")
            stats_resp = await client.get("/api/v1/stats")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert scans_resp.status_code == 200
    scans_data = scans_resp.json()
    pending_scan = next(
        item for item in scans_data["items"] if item["scan_status"] == "pending"
    )
    assert pending_scan["started_at"] is None

    assert stats_resp.status_code == 200
    stats_data = stats_resp.json()
    assert stats_data["total_scans"] == 2
    assert stats_data["completed_scans"] == 1
    assert stats_data["severity_breakdown"]["critical"] == 2
    assert stats_data["build_breakdown"] == {
        "completed": 1,
        "failed": 0,
        "unavailable": 0,
    }
    assert stats_data["avg_efficiency_score"] == 0.87
    assert stats_data["total_wasted_bytes"] == 18450000


@pytest.mark.asyncio
async def test_postgres_cancel_requested_scan_cannot_complete(
    postgres_session_factory,
):
    trivy_report = json.loads((FIXTURES / "trivy_nginx.json").read_text())

    async with postgres_session_factory() as session:
        running_scan = ScanResult(
            image_name="nginx:latest",
            scan_status="running",
            cancel_requested_at=datetime.now(timezone.utc),
        )
        session.add(running_scan)
        await session.commit()
        await session.refresh(running_scan)
        scan_id = running_scan.id

    original_async_session = scanner_module.async_session
    scanner_module.async_session = postgres_session_factory
    try:
        build_result = BuildAnalysisResult(
            status="unavailable",
            failure_reason="docker_unavailable",
        )
        final_status = await scanner_module._finalize_success_if_running(
            scan_id,
            trivy_report,
            build_result,
        )
    finally:
        scanner_module.async_session = original_async_session

    async with postgres_session_factory() as session:
        refreshed_scan = await session.get(ScanResult, scan_id)

    assert final_status == ScanStatus.CANCELLED
    assert refreshed_scan is not None
    assert refreshed_scan.scan_status == ScanStatus.CANCELLED
    assert refreshed_scan.raw_report is None
    assert refreshed_scan.summary is None


@pytest.mark.asyncio
async def test_postgres_reconcile_interrupted_scans(postgres_session_factory):
    async with postgres_session_factory() as session:
        session.add_all(
            [
                ScanResult(image_name="pending:latest", scan_status="pending"),
                ScanResult(
                    image_name="running:latest",
                    scan_status="running",
                    started_at=datetime.now(timezone.utc),
                ),
                ScanResult(image_name="done:latest", scan_status="completed"),
            ]
        )
        await session.commit()

    original_async_session = scanner_module.async_session
    scanner_module.async_session = postgres_session_factory
    try:
        reconciled = await scanner_module.reconcile_interrupted_scans()
    finally:
        scanner_module.async_session = original_async_session

    async with postgres_session_factory() as session:
        scans = {
            scan.image_name: scan
            for scan in (
                await session.execute(
                    text(
                        "SELECT image_name, scan_status, failure_reason, completed_at "
                        "FROM scan_results ORDER BY id"
                    )
                )
            ).mappings()
        }

    assert reconciled == 2
    assert scans["pending:latest"]["scan_status"] == ScanStatus.FAILED
    assert scans["pending:latest"]["failure_reason"] == "worker_restarted"
    assert scans["pending:latest"]["completed_at"] is not None
    assert scans["running:latest"]["scan_status"] == ScanStatus.FAILED
    assert scans["running:latest"]["failure_reason"] == "worker_restarted"
    assert scans["running:latest"]["completed_at"] is not None
    assert scans["done:latest"]["scan_status"] == ScanStatus.COMPLETED


@pytest.mark.asyncio
async def test_postgres_scan_detail_serializes_build_analysis(postgres_session_factory):
    trivy_report = json.loads((FIXTURES / "trivy_nginx.json").read_text())
    dive_report = json.loads((FIXTURES / "dive_nginx.json").read_text())

    async with postgres_session_factory() as session:
        session.add(
            ScanResult(
                image_name="nginx:latest",
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
                build_report={
                    "layers": [
                        {
                            "index": ly["index"],
                            "layer_id": ly["digestId"],
                            "instruction": ly["command"],
                            "size_bytes": ly["sizeBytes"],
                            "wasted_bytes": None,
                            "wasted_percent": None,
                            "efficiency_score": None,
                        }
                        for ly in dive_report["layer"][:2]
                    ]
                },
                summary={
                    "critical": 2,
                    "high": 1,
                    "medium": 0,
                    "low": 0,
                    "unknown": 0,
                },
                raw_report=trivy_report,
            )
        )
        await session.commit()

    async def override_get_db():
        async with postgres_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            detail_resp = await client.get("/api/v1/scans/1")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["build_status"] == "completed"
    assert detail_data["build"]["summary"]["efficiency_score"] == 0.87
    assert detail_data["build"]["report"]["layers"][0]["layer_id"] == "sha256:layer-1"
