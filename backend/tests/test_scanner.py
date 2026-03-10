import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ScanResult
from app.services.scanner import _execute_scan

FIXTURES = Path(__file__).parent / "fixtures"


def _make_fake_process(stdout: bytes, returncode: int, stderr: bytes = b""):
    process = AsyncMock()
    process.communicate.return_value = (stdout, stderr)
    process.returncode = returncode
    return process


@pytest.mark.asyncio
async def test_scan_success_transitions(
    db_session: AsyncSession, trivy_report
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    scan_id = scan.id

    trivy_stdout = json.dumps(trivy_report).encode()
    fake_process = _make_fake_process(trivy_stdout, returncode=0)

    with patch(
        "app.services.scanner.asyncio.create_subprocess_exec",
        return_value=fake_process,
    ):
        await _execute_scan(db_session, scan_id)

    result = await db_session.execute(
        select(ScanResult).where(ScanResult.id == scan_id)
    )
    scan = result.scalar_one()

    assert scan.scan_status == "completed"
    assert scan.completed_at is not None
    assert scan.summary == {"critical": 1, "high": 1, "medium": 1, "low": 1}
    assert scan.raw_report is not None


@pytest.mark.asyncio
async def test_scan_failure_transitions(db_session: AsyncSession):
    scan = ScanResult(image_name="nonexistent:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    scan_id = scan.id

    fake_process = _make_fake_process(
        stdout=b"",
        returncode=1,
        stderr=b"Error: image not found",
    )

    with patch(
        "app.services.scanner.asyncio.create_subprocess_exec",
        return_value=fake_process,
    ):
        await _execute_scan(db_session, scan_id)

    result = await db_session.execute(
        select(ScanResult).where(ScanResult.id == scan_id)
    )
    scan = result.scalar_one()

    assert scan.scan_status == "failed"
    assert scan.completed_at is not None
    assert scan.raw_report is None
