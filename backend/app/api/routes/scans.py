import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import settings
from app.db.session import get_db
from app.models.scan import BuildStatus, ScanResult, ScanStatus
from app.schemas.scan import (
    BuildBreakdown,
    BuildOut,
    ScanCreate,
    ScanDetailOut,
    ScanListOut,
    ScanOut,
    StatsOut,
    TopCve,
    TopImage,
)
from app.services.cache import (
    extract_requested_digest,
    get_cached_scan_id_for_digest,
    resolve_tag_digest,
)
from app.services.scanner import cancel_scan, run_scan
from app.services.trivy_parser import parse_vulnerabilities
from app.tasks import _shutdown_event, create_background_task

router = APIRouter()
# Single-process admission control keeps duplicate suppression and queue checks honest
# for the MVP deployment model (one backend instance / one worker process).
_scan_admission_lock = asyncio.Lock()


def _build_report_payload(report: dict | None) -> dict | None:
    if not isinstance(report, dict):
        return None
    layers = report.get("layers")
    if not isinstance(layers, list):
        return {"layers": []}
    return {"layers": [layer for layer in layers if isinstance(layer, dict)]}


def _build_payload(scan: ScanResult) -> BuildOut | None:
    if (
        scan.build_status is None
        and scan.build_summary is None
        and scan.build_report is None
        and scan.build_failure_reason is None
    ):
        return None

    return BuildOut(
        status=scan.build_status or BuildStatus.UNAVAILABLE,
        failure_reason=scan.build_failure_reason,
        summary=scan.build_summary,
        report=_build_report_payload(scan.build_report),
    )


async def _cancel_pending_if_still_pending(
    db: AsyncSession,
    scan_id: int,
    now: datetime,
) -> bool:
    result = await db.execute(
        update(ScanResult)
        .where(ScanResult.id == scan_id)
        .where(ScanResult.scan_status == ScanStatus.PENDING)
        .values(
            cancel_requested_at=now,
            scan_status=ScanStatus.CANCELLED,
            completed_at=now,
            failure_reason="cancelled",
        )
    )
    return (result.rowcount or 0) == 1


async def _mark_cancel_requested_if_running(
    db: AsyncSession,
    scan_id: int,
    now: datetime,
) -> bool:
    result = await db.execute(
        update(ScanResult)
        .where(ScanResult.id == scan_id)
        .where(ScanResult.scan_status == ScanStatus.RUNNING)
        .where(ScanResult.cancel_requested_at.is_(None))
        .values(cancel_requested_at=now)
    )
    return (result.rowcount or 0) == 1


@router.post(
    "/scans",
    response_model=ScanOut,
    status_code=202,
    responses={200: {"model": ScanOut}},
)
async def create_scan(
    body: ScanCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if _shutdown_event.is_set():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server is shutting down. Try again later.",
        )
    async with _scan_admission_lock:
        active_result = await db.execute(
            select(ScanResult)
            .where(ScanResult.image_name == body.image)
            .where(ScanResult.scan_status.in_((ScanStatus.PENDING, ScanStatus.RUNNING)))
            .order_by(ScanResult.created_at.desc())
        )
        active_scan = active_result.scalars().first()
        if active_scan:
            response.status_code = status.HTTP_200_OK
            return active_scan

        requested_digest = extract_requested_digest(body.image)
        cached_id = await get_cached_scan_id_for_digest(requested_digest)
        if cached_id is not None:
            result = await db.execute(
                select(ScanResult).where(ScanResult.id == cached_id)
            )
            cached = result.scalar_one_or_none()
            if (
                cached
                and cached.scan_status == ScanStatus.COMPLETED
                and cached.image_digest == requested_digest
            ):
                response.status_code = status.HTTP_200_OK
                return cached

        if settings.tag_dedup_enabled and not requested_digest:
            resolved = await resolve_tag_digest(body.image)
            if resolved is not None:
                cached_id = await get_cached_scan_id_for_digest(resolved)
                if cached_id is not None:
                    result = await db.execute(
                        select(ScanResult).where(ScanResult.id == cached_id)
                    )
                    cached = result.scalar_one_or_none()
                    if (
                        cached
                        and cached.scan_status == ScanStatus.COMPLETED
                        and cached.image_digest == resolved
                    ):
                        response.status_code = status.HTTP_200_OK
                        return cached

                recent_result = await db.execute(
                    select(ScanResult)
                    .where(ScanResult.image_digest == resolved)
                    .where(ScanResult.scan_status == ScanStatus.COMPLETED)
                    .order_by(ScanResult.completed_at.desc())
                    .limit(1)
                )
                recent = recent_result.scalar_one_or_none()
                if recent:
                    from app.services.cache import cache_scan_result

                    await cache_scan_result(resolved, recent.id)
                    response.status_code = status.HTTP_200_OK
                    return recent

        pending_count = (
            await db.execute(
                select(func.count())
                .select_from(ScanResult)
                .where(ScanResult.scan_status == ScanStatus.PENDING)
            )
        ).scalar() or 0
        if pending_count >= settings.max_pending_scans:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Scan queue is full. Try again later.",
            )

        scan = ScanResult(
            image_name=body.image,
            scan_status=ScanStatus.PENDING,
        )
        db.add(scan)
        await db.commit()
        await db.refresh(scan)

    create_background_task(run_scan(scan.id))
    return scan


@router.get("/scans", response_model=ScanListOut)
async def list_scans(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, description="Comma-separated scan statuses"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = Query(None, description="Search by image name"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ScanResult)
        .options(defer(ScanResult.raw_report), defer(ScanResult.build_report))
        .order_by(ScanResult.created_at.desc())
    )
    count_query = select(func.count()).select_from(ScanResult)

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            query = query.where(ScanResult.scan_status.in_(statuses))
            count_query = count_query.where(ScanResult.scan_status.in_(statuses))

    if date_from:
        query = query.where(ScanResult.created_at >= date_from)
        count_query = count_query.where(ScanResult.created_at >= date_from)

    if date_to:
        query = query.where(ScanResult.created_at <= date_to)
        count_query = count_query.where(ScanResult.created_at <= date_to)

    if search:
        query = query.where(ScanResult.image_name.ilike(f"%{search}%"))
        count_query = count_query.where(ScanResult.image_name.ilike(f"%{search}%"))

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
    if scan.scan_status not in (ScanStatus.PENDING, ScanStatus.RUNNING):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a scan with status '{scan.scan_status}'",
        )

    now = datetime.now(timezone.utc)
    should_kill_running_process = scan.scan_status == ScanStatus.RUNNING
    if scan.scan_status == ScanStatus.PENDING:
        if await _cancel_pending_if_still_pending(db, scan_id, now):
            await db.commit()
        else:
            should_kill_running_process = await _mark_cancel_requested_if_running(
                db, scan_id, now
            )
            await db.commit()
    else:
        if await _mark_cancel_requested_if_running(db, scan_id, now):
            should_kill_running_process = True
        await db.commit()

    if should_kill_running_process:
        await cancel_scan(scan_id)

    await db.refresh(scan)
    if scan.scan_status == ScanStatus.CANCELLED:
        return scan
    if scan.scan_status not in (ScanStatus.PENDING, ScanStatus.RUNNING):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a scan with status '{scan.scan_status}'",
        )
    return scan


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    _is_completed = case((ScanResult.scan_status == ScanStatus.COMPLETED, 1), else_=0)
    _is_failed = case((ScanResult.scan_status == ScanStatus.FAILED, 1), else_=0)

    def _severity_when_completed(severity: str):
        return func.coalesce(
            func.sum(
                case(
                    (
                        ScanResult.scan_status == ScanStatus.COMPLETED,
                        ScanResult.summary[severity].as_integer(),
                    ),
                    else_=0,
                )
            ),
            0,
        )

    counts_result = await db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(_is_completed), 0),
            func.coalesce(func.sum(_is_failed), 0),
            _severity_when_completed("critical"),
            _severity_when_completed("high"),
            _severity_when_completed("medium"),
            _severity_when_completed("low"),
            _severity_when_completed("unknown"),
        ).select_from(ScanResult)
    )
    total, completed, failed, critical, high, medium, low, unknown = counts_result.one()

    top_image_result = await db.execute(
        select(
            ScanResult.image_name,
            func.count(ScanResult.id).label("scan_count"),
        )
        .where(ScanResult.scan_status == ScanStatus.COMPLETED)
        .group_by(ScanResult.image_name)
        .order_by(func.count(ScanResult.id).desc(), ScanResult.image_name.asc())
        .limit(5)
    )
    top_images = [
        TopImage(image_name=image_name, scan_count=scan_count)
        for image_name, scan_count in top_image_result.all()
    ]

    build_result = await db.execute(
        select(ScanResult.build_status, ScanResult.build_summary).where(
            ScanResult.scan_status == ScanStatus.COMPLETED
        )
    )
    build_breakdown = {status.value: 0 for status in BuildStatus}
    efficiency_scores: list[float] = []
    total_wasted_bytes = 0
    for build_status, build_summary in build_result.all():
        if build_status in build_breakdown:
            build_breakdown[build_status] += 1
        if build_status != BuildStatus.COMPLETED or not isinstance(build_summary, dict):
            continue
        efficiency_score = build_summary.get("efficiency_score")
        if isinstance(efficiency_score, (int, float)):
            efficiency_scores.append(float(efficiency_score))
        wasted_bytes = build_summary.get("wasted_bytes")
        if isinstance(wasted_bytes, (int, float)):
            total_wasted_bytes += int(wasted_bytes)

    avg_efficiency_score = None
    if efficiency_scores:
        avg_efficiency_score = round(
            sum(efficiency_scores) / len(efficiency_scores),
            2,
        )

    # NOTE: CVE aggregation is Python-side (not SQL) because vulnerabilities are stored
    # as raw Trivy JSON in raw_report. We limit to the N most recent completed scans to
    # bound memory use. Denormalize into a Vulnerability table if this proves too slow.
    # See AGENTS.md: "Denormalize only if proven slow."
    cve_map: dict[str, dict] = {}
    cve_result = await db.execute(
        select(ScanResult.raw_report)
        .where(ScanResult.scan_status == ScanStatus.COMPLETED)
        .where(ScanResult.raw_report.is_not(None))
        .order_by(ScanResult.id.desc())
        .limit(settings.stats_recent_scan_limit)
    )
    for raw_report in cve_result.scalars():
        for vuln in parse_vulnerabilities(raw_report):
            vid = vuln["vuln_id"]
            if vid not in cve_map:
                cve_map[vid] = {
                    "count": 0,
                    "severity": vuln["severity"],
                    "title": vuln["title"],
                }
            cve_map[vid]["count"] += 1

    top_cves = sorted(cve_map.items(), key=lambda x: x[1]["count"], reverse=True)[:10]

    return StatsOut(
        total_scans=total,
        completed_scans=completed,
        failed_scans=failed,
        severity_breakdown={
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low,
            "unknown": unknown,
        },
        build_breakdown=BuildBreakdown(**build_breakdown),
        avg_efficiency_score=avg_efficiency_score,
        total_wasted_bytes=total_wasted_bytes,
        top_cves=[
            TopCve(
                vuln_id=k,
                count=v["count"],
                severity=v["severity"],
                title=v["title"],
            )
            for k, v in top_cves
        ],
        top_images=top_images,
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
        build_status=scan.build_status,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        summary=scan.summary,
        created_at=scan.created_at,
        vulnerabilities=vulns,
        build=_build_payload(scan),
    )
