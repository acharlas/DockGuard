import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.scans import _cancel_pending_if_still_pending
from app.models.scan import BuildStatus, ScanResult, ScanStatus
from app.services import scanner as scanner_module
from app.services.dive import BuildAnalysisResult
from app.services.scanner import (
    _execute_scan,
    _transition_pending_to_running,
    reconcile_interrupted_scans,
)


@pytest.mark.asyncio
async def test_scan_success_transitions(
    db_session: AsyncSession,
    trivy_report,
    dive_report,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with (
        patch("app.services.scanner._run_trivy", AsyncMock(return_value=trivy_report)),
        patch(
            "app.services.scanner.analyze_image_build",
            AsyncMock(
                return_value=BuildAnalysisResult(
                    status=BuildStatus.COMPLETED,
                    summary={
                        "image_size_bytes": 205000000,
                        "efficiency_score": 0.87,
                        "wasted_bytes": 18450000,
                        "wasted_percent": 9.0,
                        "layer_count": 4,
                        "inefficient_layer_count": 2,
                    },
                    report={"layers": dive_report["layer"][:2]},
                )
            ),
        ),
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "completed"
    assert scan.started_at is not None
    assert scan.completed_at is not None
    assert scan.summary == {
        "critical": 1,
        "high": 1,
        "medium": 1,
        "low": 1,
        "unknown": 0,
    }
    assert (
        scan.image_digest
        == "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )
    assert scan.failure_reason is None
    assert scan.raw_report is not None
    assert scan.build_status == BuildStatus.COMPLETED
    assert scan.build_summary is not None
    assert scan.build_summary["efficiency_score"] == 0.87
    assert scan.build_report is not None


@pytest.mark.asyncio
async def test_scan_build_failure_keeps_scan_completed(
    db_session: AsyncSession,
    trivy_report,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with (
        patch("app.services.scanner._run_trivy", AsyncMock(return_value=trivy_report)),
        patch(
            "app.services.scanner.analyze_image_build",
            AsyncMock(
                return_value=BuildAnalysisResult(
                    status=BuildStatus.UNAVAILABLE,
                    failure_reason="docker_unavailable",
                )
            ),
        ),
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == ScanStatus.COMPLETED
    assert scan.build_status == BuildStatus.UNAVAILABLE
    assert scan.build_failure_reason == "docker_unavailable"
    assert scan.build_summary is None
    assert scan.build_report is None


@pytest.mark.asyncio
async def test_scan_failure_transitions(db_session: AsyncSession):
    scan = ScanResult(image_name="nonexistent:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with (
        patch(
            "app.services.scanner._run_trivy",
            AsyncMock(
                side_effect=RuntimeError(
                    "Trivy exited with code 1: Error: image not found"
                )
            ),
        ),
        patch(
            "app.services.scanner.analyze_image_build",
            AsyncMock(),
        ) as build_mock,
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "failed"
    assert scan.started_at is not None
    assert scan.completed_at is not None
    assert scan.failure_reason == "Trivy exited with code 1: Error: image not found"
    assert scan.raw_report is None
    assert scan.build_status is None
    build_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_scan_timeout_transitions(db_session: AsyncSession):
    scan = ScanResult(image_name="slow:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with patch("app.services.scanner._run_trivy", side_effect=TimeoutError):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "failed"
    assert scan.started_at is not None
    assert scan.completed_at is not None
    assert scan.failure_reason == "timeout"


@pytest.mark.asyncio
async def test_scan_cancel_requested_before_start(db_session: AsyncSession):
    scan = ScanResult(
        image_name="nginx:latest",
        scan_status="pending",
        cancel_requested_at=datetime.now(timezone.utc),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "cancelled"
    assert scan.started_at is None
    assert scan.completed_at is not None
    assert scan.failure_reason == "cancelled"


@pytest.mark.asyncio
async def test_scan_cancelled_after_trivy_before_build(
    db_session: AsyncSession,
    trivy_report,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    async def fake_run_trivy(scan_id: int, image_name: str):
        assert image_name == "nginx:latest"
        async with scanner_module.async_session() as session:
            result = await session.execute(
                select(ScanResult).where(ScanResult.id == scan_id)
            )
            running_scan = result.scalar_one()
            running_scan.cancel_requested_at = datetime.now(timezone.utc)
            await session.commit()
        return trivy_report

    with (
        patch("app.services.scanner._run_trivy", side_effect=fake_run_trivy),
        patch(
            "app.services.scanner.analyze_image_build",
            AsyncMock(),
        ) as build_mock,
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "cancelled"
    assert scan.raw_report is None
    assert scan.summary is None
    assert scan.build_status is None
    assert scan.completed_at is not None
    assert scan.failure_reason == "cancelled"
    build_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_scan_cancelled_before_success_persistence(
    db_session: AsyncSession,
    trivy_report,
    dive_report,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    async def fake_build_analysis(scan_id: int, image_name: str):
        assert image_name == "nginx:latest"
        async with scanner_module.async_session() as session:
            result = await session.execute(
                select(ScanResult).where(ScanResult.id == scan_id)
            )
            running_scan = result.scalar_one()
            running_scan.cancel_requested_at = datetime.now(timezone.utc)
            await session.commit()
        return BuildAnalysisResult(
            status=BuildStatus.COMPLETED,
            summary={
                "image_size_bytes": 205000000,
                "efficiency_score": 0.87,
                "wasted_bytes": 18450000,
                "wasted_percent": 9.0,
                "layer_count": 4,
                "inefficient_layer_count": 2,
            },
            report={"layers": dive_report["layer"][:2]},
        )

    with (
        patch("app.services.scanner._run_trivy", AsyncMock(return_value=trivy_report)),
        patch(
            "app.services.scanner.analyze_image_build",
            side_effect=fake_build_analysis,
        ),
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "cancelled"
    assert scan.raw_report is None
    assert scan.summary is None
    assert scan.build_status is None
    assert scan.completed_at is not None
    assert scan.failure_reason == "cancelled"


@pytest.mark.asyncio
async def test_pending_cancel_and_start_transition_are_mutually_exclusive(
    db_session: AsyncSession,
    session_factory,
):
    scan = ScanResult(image_name="nginx:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    async def start_scan():
        return await _transition_pending_to_running(scan.id)

    async def cancel_pending():
        async with session_factory() as session:
            cancelled = await _cancel_pending_if_still_pending(
                session,
                scan.id,
                datetime.now(timezone.utc),
            )
            await session.commit()
            return cancelled

    started_image, cancelled = await asyncio.gather(start_scan(), cancel_pending())
    await db_session.refresh(scan)

    assert (started_image is not None) != cancelled
    assert scan.scan_status in ("running", "cancelled")
    if cancelled:
        assert scan.started_at is None
        assert scan.completed_at is not None
        assert scan.failure_reason == "cancelled"
    else:
        assert started_image == "nginx:latest"
        assert scan.started_at is not None
        assert scan.completed_at is None


@pytest.mark.asyncio
async def test_scan_state_transition_failure_marks_scan_failed(
    db_session: AsyncSession,
):
    scan = ScanResult(image_name="broken:latest", scan_status="pending")
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    with patch(
        "app.services.scanner._transition_pending_to_running",
        side_effect=RuntimeError("state transition failed"),
    ):
        await _execute_scan(scan.id)
    await db_session.refresh(scan)

    assert scan.scan_status == "failed"
    assert scan.failure_reason == "state transition failed"


@pytest.mark.asyncio
async def test_reconcile_interrupted_scans_marks_active_rows_failed(
    db_session: AsyncSession,
):
    pending_scan = ScanResult(image_name="pending:latest", scan_status="pending")
    running_scan = ScanResult(
        image_name="running:latest",
        scan_status="running",
        started_at=datetime.now(timezone.utc),
    )
    completed_scan = ScanResult(image_name="done:latest", scan_status="completed")
    db_session.add_all([pending_scan, running_scan, completed_scan])
    await db_session.commit()

    reconciled = await reconcile_interrupted_scans()
    await db_session.refresh(pending_scan)
    await db_session.refresh(running_scan)
    await db_session.refresh(completed_scan)

    assert reconciled == 2
    assert pending_scan.scan_status == "failed"
    assert pending_scan.failure_reason == "worker_restarted"
    assert pending_scan.completed_at is not None
    assert running_scan.scan_status == "failed"
    assert running_scan.failure_reason == "worker_restarted"
    assert running_scan.completed_at is not None
    assert completed_scan.scan_status == "completed"
