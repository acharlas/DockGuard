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
from app.services.metrics import (
    active_scans,
    scan_duration_seconds,
    scans_total,
    vulnerabilities_found,
)
from app.services.trivy_parser import compute_summary, extract_image_digest

logger = logging.getLogger(__name__)

_scan_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)
_ACTIVE_SCAN_STATUSES = (ScanStatus.PENDING, ScanStatus.RUNNING)
_WORKER_RESTARTED_REASON = "worker_restarted"
# In-process state — requires single uvicorn worker (default).
# Multi-worker deployments would need an external store (e.g. Redis) for cancellation.
_running_processes: dict[int, asyncio.subprocess.Process] = {}


async def cancel_scan(scan_id: int) -> None:
    proc = _running_processes.get(scan_id)
    if proc is not None and proc.returncode is None:
        proc.kill()


async def _stream_stderr(process: asyncio.subprocess.Process, scan_id: int) -> bytes:
    lines = []
    while True:
        line = await process.stderr.readline()
        if not line:
            break
        lines.append(line)
        logger.info("Scan %d [trivy]: %s", scan_id, line.decode().rstrip())
    return b"".join(lines)


async def run_scan(scan_id: int) -> None:
    async with _scan_semaphore:
        await _execute_scan(scan_id)


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


async def _finalize_success_if_running(scan_id: int, report: dict) -> ScanStatus | None:
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
                scan_status=ScanStatus.COMPLETED,
                completed_at=now,
                failure_reason=None,
            )
        )
        if (success_result.rowcount or 0) == 1:
            await db.commit()
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
    process = await asyncio.create_subprocess_exec(
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
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _running_processes[scan_id] = process
    try:
        stdout, stderr = await asyncio.wait_for(
            asyncio.gather(
                process.stdout.read(),
                _stream_stderr(process, scan_id),
            ),
            timeout=settings.trivy_timeout,
        )
    finally:
        _running_processes.pop(scan_id, None)
        if process.returncode is None:
            try:
                await asyncio.wait_for(process.wait(), timeout=1)
            except TimeoutError:
                process.kill()
                await process.wait()
        else:
            await process.wait()

    if process.returncode != 0:
        raise RuntimeError(
            f"Trivy exited with code {process.returncode}: {stderr.decode().strip()}"
        )
    return json.loads(stdout.decode())


async def _execute_scan(scan_id: int) -> None:
    final_status: ScanStatus | None = None
    started: float | None = None
    metrics_started = False
    try:
        image_name = await _transition_pending_to_running(scan_id)
        if image_name is None:
            if await _finalize_cancel_if_requested(scan_id):
                final_status = ScanStatus.CANCELLED
            return

        metrics_started = True
        active_scans.inc()
        started = time.monotonic()
        report = await _run_trivy(scan_id, image_name)
        final_status = await _finalize_success_if_running(scan_id, report)
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
        if metrics_started and started is not None:
            active_scans.dec()
            scan_duration_seconds.observe(time.monotonic() - started)
        if final_status is not None:
            scans_total.labels(status=final_status).inc()
