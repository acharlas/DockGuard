import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import async_session
from app.models.scan import ScanResult, ScanStatus
from app.services.cache import cache_scan_result
from app.services.dive import BuildAnalysisResult, analyze_image_build
from app.services.metrics import (
    active_scans,
    build_analyses_total,
    scan_duration_seconds,
    scans_total,
    vulnerabilities_found,
)
from app.services.subprocesses import cancel_running_process, run_logged_command
from app.services.trivy_parser import compute_summary, extract_image_digest

logger = logging.getLogger(__name__)

_scan_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)
_ACTIVE_SCAN_STATUSES = (ScanStatus.PENDING, ScanStatus.RUNNING)
_WORKER_RESTARTED_REASON = "worker_restarted"


async def cancel_scan(scan_id: int) -> None:
    await cancel_running_process(scan_id)


async def run_scan(scan_id: int) -> None:
    try:
        await asyncio.wait_for(
            _scan_semaphore.acquire(),
            timeout=settings.semaphore_acquire_timeout,
        )
    except TimeoutError:
        await _finalize_failure_if_active(scan_id, "semaphore_timeout")
        return
    try:
        await _execute_scan(scan_id)
    finally:
        _scan_semaphore.release()


async def reconcile_interrupted_scans() -> int:
    now = datetime.now(timezone.utc)

    async with async_session() as db:
        result = await db.execute(
            update(ScanResult)
            .where(ScanResult.scan_status.in_(_ACTIVE_SCAN_STATUSES))
            .values(
                scan_status=ScanStatus.FAILED,
                completed_at=now,
                failure_reason=_WORKER_RESTARTED_REASON,
            )
        )
        reconciled = result.rowcount or 0
        if reconciled:
            await db.commit()
            logger.warning(
                "Reconciled %d interrupted scans after startup",
                reconciled,
            )
        return reconciled


async def _transition_pending_to_running(scan_id: int) -> str | None:
    async with async_session() as db:
        image_name = (
            await db.execute(
                select(ScanResult.image_name).where(ScanResult.id == scan_id)
            )
        ).scalar_one_or_none()
        if image_name is None:
            return None

        result = await db.execute(
            update(ScanResult)
            .where(ScanResult.id == scan_id)
            .where(ScanResult.scan_status == ScanStatus.PENDING)
            .where(ScanResult.cancel_requested_at.is_(None))
            .values(
                scan_status=ScanStatus.RUNNING,
                started_at=datetime.now(timezone.utc),
                completed_at=None,
                failure_reason=None,
                build_status=None,
                build_failure_reason=None,
                build_summary=None,
                build_report=None,
            )
        )
        if (result.rowcount or 0) != 1:
            return None
        await db.commit()
        return image_name


async def _cancel_active_if_requested(
    db: AsyncSession,
    scan_id: int,
    now: datetime,
) -> bool:
    result = await db.execute(
        update(ScanResult)
        .where(ScanResult.id == scan_id)
        .where(ScanResult.scan_status.in_(_ACTIVE_SCAN_STATUSES))
        .where(ScanResult.cancel_requested_at.is_not(None))
        .values(
            scan_status=ScanStatus.CANCELLED,
            completed_at=now,
            failure_reason="cancelled",
        )
    )
    return (result.rowcount or 0) == 1


async def _finalize_cancel_if_requested(scan_id: int) -> bool:
    now = datetime.now(timezone.utc)

    async with async_session() as db:
        if await _cancel_active_if_requested(db, scan_id, now):
            await db.commit()
            return True

        current_status = (
            await db.execute(
                select(ScanResult.scan_status).where(ScanResult.id == scan_id)
            )
        ).scalar_one_or_none()
        return current_status == ScanStatus.CANCELLED


async def _finalize_success_if_running(
    scan_id: int,
    report: dict,
    build_result: BuildAnalysisResult,
) -> ScanStatus | None:
    image_digest = extract_image_digest(report)
    summary = compute_summary(report)
    now = datetime.now(timezone.utc)

    async with async_session() as db:
        success_result = await db.execute(
            update(ScanResult)
            .where(ScanResult.id == scan_id)
            .where(ScanResult.scan_status == ScanStatus.RUNNING)
            .where(ScanResult.cancel_requested_at.is_(None))
            .values(
                raw_report=report,
                summary=summary,
                image_digest=image_digest,
                build_status=build_result.status,
                build_failure_reason=build_result.failure_reason,
                build_summary=build_result.summary,
                build_report=build_result.report,
                scan_status=ScanStatus.COMPLETED,
                completed_at=now,
                failure_reason=None,
            )
        )
        if (success_result.rowcount or 0) == 1:
            await db.commit()
            # Fall through — cache write and metrics happen after this block exits.
        else:
            if await _cancel_active_if_requested(db, scan_id, now):
                await db.commit()
                return ScanStatus.CANCELLED

            current_status = (
                await db.execute(
                    select(ScanResult.scan_status).where(ScanResult.id == scan_id)
                )
            ).scalar_one_or_none()
            if current_status in (ScanStatus.COMPLETED, ScanStatus.CANCELLED):
                return current_status
            return None

    await cache_scan_result(image_digest, scan_id)

    for severity, count in summary.items():
        if count > 0:
            vulnerabilities_found.labels(severity=severity).inc(count)
    build_analyses_total.labels(status=build_result.status).inc()
    return ScanStatus.COMPLETED


async def _finalize_failure_if_active(
    scan_id: int,
    failure_reason: str,
) -> ScanStatus | None:
    now = datetime.now(timezone.utc)

    async with async_session() as db:
        failure_result = await db.execute(
            update(ScanResult)
            .where(ScanResult.id == scan_id)
            .where(ScanResult.scan_status.in_(_ACTIVE_SCAN_STATUSES))
            .where(ScanResult.cancel_requested_at.is_(None))
            .values(
                scan_status=ScanStatus.FAILED,
                completed_at=now,
                failure_reason=failure_reason,
                build_status=None,
                build_failure_reason=None,
                build_summary=None,
                build_report=None,
            )
        )
        if (failure_result.rowcount or 0) == 1:
            await db.commit()
            return ScanStatus.FAILED

        if await _cancel_active_if_requested(db, scan_id, now):
            await db.commit()
            return ScanStatus.CANCELLED

        current_status = (
            await db.execute(
                select(ScanResult.scan_status).where(ScanResult.id == scan_id)
            )
        ).scalar_one_or_none()
        if current_status in (ScanStatus.FAILED, ScanStatus.CANCELLED):
            return current_status
        return None


def _failure_reason(exc: Exception) -> str:
    message = str(exc).strip()
    if not message:
        return "scan_failed"
    return message[:255]


async def _run_trivy(scan_id: int, image_name: str) -> dict:
    stdout = await run_logged_command(
        scan_id,
        "trivy",
        "trivy",
        "image",
        "--format",
        "json",
        "--no-progress",
        "--scanners",
        "vuln",
        "--timeout",
        f"{settings.trivy_timeout}s",
        image_name,
        timeout=settings.trivy_timeout,
    )
    return json.loads(stdout)


async def _execute_scan(scan_id: int) -> None:
    final_status: ScanStatus | None = None
    started: float | None = None
    try:
        image_name = await _transition_pending_to_running(scan_id)
        if image_name is None:
            if await _finalize_cancel_if_requested(scan_id):
                final_status = ScanStatus.CANCELLED
            return

        active_scans.inc()
        started = time.monotonic()

        report = await _run_trivy(scan_id, image_name)
        if await _finalize_cancel_if_requested(scan_id):
            final_status = ScanStatus.CANCELLED
            return

        build_result = await analyze_image_build(scan_id, image_name)
        final_status = await _finalize_success_if_running(scan_id, report, build_result)
    except TimeoutError:
        final_status = await _finalize_failure_if_active(scan_id, "timeout")
        if final_status != ScanStatus.CANCELLED:
            logger.error("Scan %d timed out after %ds", scan_id, settings.trivy_timeout)
    except Exception as exc:
        final_status = await _finalize_failure_if_active(
            scan_id,
            _failure_reason(exc),
        )
        if final_status != ScanStatus.CANCELLED:
            logger.exception("Scan %d failed", scan_id)
    finally:
        if started is not None:
            active_scans.dec()
            scan_duration_seconds.observe(time.monotonic() - started)
        if final_status is not None:
            scans_total.labels(status=final_status).inc()
