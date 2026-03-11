import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import async_session
from app.models.scan import ScanResult
from app.services.trivy_parser import compute_summary

logger = logging.getLogger(__name__)

_scan_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)


async def run_scan(scan_id: int) -> None:
    async with _scan_semaphore:
        async with async_session() as db:
            await _execute_scan(db, scan_id)


async def _execute_scan(db: AsyncSession, scan_id: int) -> None:
    result = await db.execute(
        select(ScanResult).where(ScanResult.id == scan_id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        logger.error("Scan %d not found", scan_id)
        return

    scan.scan_status = "running"
    await db.commit()

    try:
        process = await asyncio.create_subprocess_exec(
            "trivy", "image", "--format", "json", "--quiet",
            "--scanners", "vuln",
            scan.image_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=settings.trivy_timeout,
        )

        if process.returncode != 0:
            raise RuntimeError(
                f"Trivy exited with code {process.returncode}: "
                f"{stderr.decode().strip()}"
            )

        report = json.loads(stdout.decode())
        scan.raw_report = report
        scan.summary = compute_summary(report)
        scan.scan_status = "completed"
        scan.completed_at = datetime.now(timezone.utc)

    except TimeoutError:
        logger.error("Scan %d timed out after %ds", scan_id, settings.trivy_timeout)
        scan.scan_status = "failed"
        scan.completed_at = datetime.now(timezone.utc)

    except Exception:
        logger.exception("Scan %d failed", scan_id)
        scan.scan_status = "failed"
        scan.completed_at = datetime.now(timezone.utc)

    await db.commit()
