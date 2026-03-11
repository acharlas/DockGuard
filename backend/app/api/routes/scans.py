import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.scan import ScanResult
from app.schemas.scan import (
    ScanCreate,
    ScanDetailOut,
    ScanListOut,
    ScanOut,
    StatsOut,
    TopCve,
    TopImage,
)
from app.services.cache import get_cached_scan_id
from app.services.scanner import cancel_scan, run_scan
from app.services.trivy_parser import parse_vulnerabilities

router = APIRouter()


@router.post("/scans", response_model=ScanOut, status_code=202)
async def create_scan(body: ScanCreate, db: AsyncSession = Depends(get_db)):
    # Return cached result if available (same image scanned within 10 min)
    cached_id = await get_cached_scan_id(body.image)
    if cached_id is not None:
        result = await db.execute(select(ScanResult).where(ScanResult.id == cached_id))
        cached = result.scalar_one_or_none()
        if cached and cached.scan_status == "completed":
            return cached

    scan = ScanResult(image_name=body.image, scan_status="pending")
    db.add(scan)
    await db.commit()
    await db.refresh(scan)
    asyncio.create_task(run_scan(scan.id))
    return scan


@router.get("/scans", response_model=ScanListOut)
async def list_scans(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(ScanResult).order_by(ScanResult.created_at.desc())
    count_query = select(func.count()).select_from(ScanResult)

    if status:
        query = query.where(ScanResult.scan_status == status)
        count_query = count_query.where(ScanResult.scan_status == status)

    if date_from:
        query = query.where(ScanResult.created_at >= date_from)
        count_query = count_query.where(ScanResult.created_at >= date_from)

    if date_to:
        query = query.where(ScanResult.created_at <= date_to)
        count_query = count_query.where(ScanResult.created_at <= date_to)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * size
    result = await db.execute(query.offset(offset).limit(size))
    scans = result.scalars().all()

    return ScanListOut(items=scans, total=total, page=page, size=size)


@router.post("/scans/{scan_id}/cancel", response_model=ScanOut)
async def cancel_scan_endpoint(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.scan_status not in ("pending", "running"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a scan with status '{scan.scan_status}'",
        )

    await cancel_scan(scan_id)

    # For pending scans the process hasn't started yet — update DB directly.
    # For running scans the exception handler in _execute_scan will update it,
    # but we set it here too so the response is immediate.
    scan.scan_status = "cancelled"
    scan.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(scan)
    return scan


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = (
        await db.execute(select(func.count()).select_from(ScanResult))
    ).scalar() or 0
    completed = (
        await db.execute(
            select(func.count())
            .select_from(ScanResult)
            .where(ScanResult.scan_status == "completed")
        )
    ).scalar() or 0
    failed = (
        await db.execute(
            select(func.count())
            .select_from(ScanResult)
            .where(ScanResult.scan_status == "failed")
        )
    ).scalar() or 0

    result = await db.execute(
        select(ScanResult).where(ScanResult.scan_status == "completed")
    )
    scans = result.scalars().all()

    severity: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    cve_map: dict[str, dict] = {}
    image_counts: dict[str, int] = {}

    for scan in scans:
        if scan.summary:
            for key in severity:
                severity[key] += scan.summary.get(key, 0)
        if scan.raw_report:
            for vuln in parse_vulnerabilities(scan.raw_report):
                vid = vuln["vuln_id"]
                if vid not in cve_map:
                    cve_map[vid] = {
                        "count": 0,
                        "severity": vuln["severity"],
                        "title": vuln["title"],
                    }
                cve_map[vid]["count"] += 1
        image_counts[scan.image_name] = image_counts.get(scan.image_name, 0) + 1

    top_cves = sorted(cve_map.items(), key=lambda x: x[1]["count"], reverse=True)[:10]
    top_images = sorted(image_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return StatsOut(
        total_scans=total,
        completed_scans=completed,
        failed_scans=failed,
        severity_breakdown=severity,
        top_cves=[
            TopCve(
                vuln_id=k,
                count=v["count"],
                severity=v["severity"],
                title=v["title"],
            )
            for k, v in top_cves
        ],
        top_images=[TopImage(image_name=k, scan_count=v) for k, v in top_images],
    )


@router.get("/scans/{scan_id}", response_model=ScanDetailOut)
async def get_scan(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    vulns = parse_vulnerabilities(scan.raw_report)
    return ScanDetailOut(
        id=scan.id,
        image_name=scan.image_name,
        image_digest=scan.image_digest,
        scan_status=scan.scan_status,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        summary=scan.summary,
        created_at=scan.created_at,
        vulnerabilities=vulns,
    )
