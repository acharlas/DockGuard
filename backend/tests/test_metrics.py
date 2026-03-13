import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from prometheus_client import REGISTRY

from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_prometheus_format():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    # All four custom metrics must be present
    body = resp.text
    assert "dockguard_scans_total" in body
    assert "dockguard_scan_duration_seconds" in body
    assert "dockguard_vulnerabilities_found" in body
    assert "dockguard_active_scans" in body


@pytest.mark.asyncio
async def test_metrics_recorded_after_successful_scan(db_session):
    from app.models.scan import ScanResult
    from app.services.scanner import _execute_scan

    trivy_report = json.loads((FIXTURES / "trivy_nginx.json").read_text())

    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    before_scans = (
        REGISTRY.get_sample_value("dockguard_scans_total", {"status": "completed"}) or 0
    )
    before_vulns = (
        REGISTRY.get_sample_value(
            "dockguard_vulnerabilities_found_total", {"severity": "critical"}
        )
        or 0
    )

    fake_process = AsyncMock()
    fake_process.stdout.read = AsyncMock(
        side_effect=[json.dumps(trivy_report).encode(), b""]
    )
    fake_process.stderr.readline = AsyncMock(return_value=b"")
    fake_process.returncode = 0
    fake_process.kill = MagicMock()
    fake_process.wait = AsyncMock()

    with patch(
        "app.services.scanner.asyncio.create_subprocess_exec",
        return_value=fake_process,
    ):
        await _execute_scan(scan.id)

    assert (
        REGISTRY.get_sample_value("dockguard_scans_total", {"status": "completed"}) or 0
    ) == before_scans + 1
    assert (
        REGISTRY.get_sample_value(
            "dockguard_vulnerabilities_found_total", {"severity": "critical"}
        )
        or 0
    ) == before_vulns + 1
