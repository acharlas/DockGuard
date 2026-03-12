from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.routes import health, scans
from app.config import settings
from app.db.session import engine
from app.services.dive import log_build_runtime_status
from app.services.scanner import reconcile_interrupted_scans
from app.tasks import _background_tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    await reconcile_interrupted_scans()
    log_build_runtime_status()
    yield
    for task in _background_tasks:
        task.cancel()
    await engine.dispose()


app = FastAPI(title="DockGuard", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(scans.router, prefix="/api/v1", tags=["scans"])


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
