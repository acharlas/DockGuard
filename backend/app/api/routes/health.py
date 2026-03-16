import asyncio
import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.cache import _get_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    components: dict[str, str] = {}

    # Database
    try:
        await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"

    # Redis (optional — unavailable is not unhealthy)
    try:
        r = await _get_client()
        if r is not None:
            await r.ping()
            components["redis"] = "healthy"
        else:
            components["redis"] = "unavailable"
    except Exception:
        components["redis"] = "unavailable"

    # Trivy CLI
    try:
        proc = await asyncio.create_subprocess_exec(
            "trivy", "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.wait(), timeout=5)
        components["trivy"] = "healthy" if proc.returncode == 0 else "unhealthy"
    except Exception:
        components["trivy"] = "unhealthy"

    # Overall: healthy if DB + Trivy are both healthy (Redis is optional)
    required_healthy = components["database"] == "healthy" and components["trivy"] == "healthy"
    overall = "healthy" if required_healthy else "degraded"
    code = status.HTTP_200_OK if required_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=code,
        content={"status": overall, **components},
    )
