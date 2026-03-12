import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
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
from app.services.trivy_parser import compute_summary

logger = logging.getLogger(__name__)

_scan_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)
# In-process state — requires single uvicorn worker (default).
# Multi-worker deployments would need an external store (e.g. Redis) for cancellation.
_running_processes: dict[int, asyncio.subprocess.Process] = {}
_cancelled_scan_ids: set[int] = set()


async def cancel_scan(scan_id: int) -> None:
    proc = _running_processes.get(scan_id)
    if proc is not None and proc.returncode is None:
        _cancelled_scan_ids.add(scan_id)
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
        async with async_session() as db:
            await _execute_scan(db, scan_id)


async def _execute_scan(db: AsyncSession, scan_id: int) -> None:
    result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        logger.error("Scan %d not found", scan_id)
        return

    if scan.scan_status == ScanStatus.CANCELLED or scan_id in _cancelled_scan_ids:
        _cancelled_scan_ids.discard(scan_id)
        return

    scan.scan_status = ScanStatus.RUNNING
    await db.commit()

    active_scans.inc()
    started = time.monotonic()
    try:
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
            scan.image_name,
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
                process.kill()
            await process.wait()

        if process.returncode != 0:
            raise RuntimeError(
                f"Trivy exited with code {process.returncode}: "
                f"{stderr.decode().strip()}"
            )

        report = json.loads(stdout.decode())
        scan.raw_report = report
        scan.summary = compute_summary(report)
        scan.scan_status = ScanStatus.COMPLETED
        scan.completed_at = datetime.now(timezone.utc)
        await cache_scan_result(scan.image_name, scan.id)

        for severity, count in scan.summary.items():
            if count > 0:
                vulnerabilities_found.labels(severity=severity).inc(count)

    except TimeoutError:
        logger.error("Scan %d timed out after %ds", scan_id, settings.trivy_timeout)
        scan.scan_status = ScanStatus.FAILED
        scan.completed_at = datetime.now(timezone.utc)

    except Exception:
        if scan_id in _cancelled_scan_ids:
            _cancelled_scan_ids.discard(scan_id)
            scan.scan_status = ScanStatus.CANCELLED
        else:
            logger.exception("Scan %d failed", scan_id)
            scan.scan_status = ScanStatus.FAILED
        scan.completed_at = datetime.now(timezone.utc)

    finally:
        active_scans.dec()
        scan_duration_seconds.observe(time.monotonic() - started)
        scans_total.labels(status=scan.scan_status).inc()

    await db.commit()
