import asyncio
from datetime import datetime

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
)
from app.services.scanner import run_scan
from app.services.trivy_parser import parse_vulnerabilities

router = APIRouter()


@router.post("/scans", response_model=ScanOut, status_code=202)
async def create_scan(body: ScanCreate, db: AsyncSession = Depends(get_db)):
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
