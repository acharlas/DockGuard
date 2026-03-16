# Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the DockGuard backend for production use with 50 concurrent users — CORS lockdown, DB pool config, structured logging, graceful shutdown, health check expansion, and DB indexes.

**Architecture:** All changes are in `backend/`. No infrastructure changes. The backend is FastAPI + SQLAlchemy async + asyncpg + Redis. Single uvicorn worker deployment model.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic, pytest, ruff

**Spec:** `docs/superpowers/specs/2026-03-16-oracle-cloudflare-prod-refactor-design.md` (Sub-Project 1)

---

## Chunk 1: DB Pool, CORS, Logging

### Task 1: DB Connection Pool Configuration

**Files:**
- Modify: `backend/app/db/session.py`
- Modify: `backend/tests/conftest.py` (verify test engine isn't affected)

- [ ] **Step 1: Modify `backend/app/db/session.py`**

Replace the current engine creation (line 7):
```python
engine = create_async_engine(settings.database_url)
```

With explicit pool configuration:
```python
engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)
```

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS (pool config is transparent to test suite)

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/session.py
git commit -m "feat: add explicit DB connection pool config for 50-user concurrency"
```

### Task 2: CORS Lockdown

**Files:**
- Modify: `backend/app/main.py:28-34`

- [ ] **Step 1: Modify CORS middleware in `backend/app/main.py`**

Replace lines 28-34:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

With:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
```

- [ ] **Step 2: Run tests**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "fix: restrict CORS to GET/POST methods and Content-Type header"
```

### Task 3: Structured Logging

**Files:**
- Modify: `backend/app/main.py` (add logging config in lifespan)
- Modify: `backend/app/services/subprocesses.py` (add truncation warning)

- [ ] **Step 1: Add logging config to `backend/app/main.py`**

Add import at top:
```python
import logging
import logging.config
```

Add logging config dict before the `lifespan` function:
```python
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "format": '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "stream": "ext://sys.stdout",
        },
    },
    "root": {
        "level": "INFO",
        "handlers": ["console"],
    },
    "loggers": {
        "uvicorn": {"level": "INFO", "handlers": ["console"], "propagate": False},
        "uvicorn.access": {"level": "INFO", "handlers": ["console"], "propagate": False},
    },
}
```

Add as first line inside `lifespan`, before `await reconcile_interrupted_scans()`:
```python
logging.config.dictConfig(LOGGING_CONFIG)
```

- [ ] **Step 2: Add truncation warning in `backend/app/services/subprocesses.py`**

After line 41 (`if truncated:`), before `lines.extend(b"\n... stderr truncated ...")`, add:
```python
        logger.warning(
            "Scan %d [%s] stderr truncated at %d bytes",
            scan_id,
            label,
            _MAX_CAPTURED_STDERR_BYTES,
        )
```

- [ ] **Step 3: Run tests**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/app/services/subprocesses.py
git commit -m "feat: add structured JSON logging and stderr truncation warning"
```

## Chunk 2: Graceful Shutdown, Health Check

### Task 4: Graceful Shutdown

**Files:**
- Modify: `backend/app/tasks.py` (add shutdown event here to avoid circular import)
- Modify: `backend/app/main.py` (lifespan shutdown)
- Modify: `backend/app/api/routes/scans.py` (check shutdown event in POST /scans)
- Create: `backend/tests/test_shutdown.py`

> **Note:** `_shutdown_event` lives in `tasks.py` (not `main.py`) to avoid a circular import.
> `main.py` imports `scans.py` (via router), so `scans.py` cannot import from `main.py`.
> This follows the existing pattern where `_background_tasks` is in `tasks.py`.

- [ ] **Step 1: Add shutdown event to `backend/app/tasks.py`**

Add at the end of the file:
```python
_shutdown_event = asyncio.Event()
```

The file already imports `asyncio`.

- [ ] **Step 2: Write the failing test in `backend/tests/test_shutdown.py`**

```python
import pytest
from httpx import AsyncClient

from app.tasks import _shutdown_event


@pytest.mark.asyncio
async def test_post_scans_returns_503_during_shutdown(client: AsyncClient):
    _shutdown_event.set()
    try:
        resp = await client.post("/api/v1/scans", json={"image": "nginx:latest"})
        assert resp.status_code == 503
        assert "shutting down" in resp.json()["detail"].lower()
    finally:
        _shutdown_event.clear()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose exec backend python -m pytest tests/test_shutdown.py -v -p no:cacheprovider`
Expected: FAIL (no shutdown check in scans.py yet)

- [ ] **Step 4: Update lifespan shutdown in `backend/app/main.py`**

Add `import asyncio` to imports.

Add import of shutdown event:
```python
from app.tasks import _background_tasks, _shutdown_event
```

(Remove the existing separate import of `_background_tasks` from `app.tasks`.)

Replace the lifespan shutdown section (lines 21-23, after `yield`):
```python
    _shutdown_event.set()
    # Give active scans up to 10s to finish
    for _ in range(20):
        if not _background_tasks:
            break
        await asyncio.sleep(0.5)
    for task in _background_tasks:
        task.cancel()
    await engine.dispose()
```

- [ ] **Step 5: Add shutdown check in `backend/app/api/routes/scans.py`**

Add import at top:
```python
from app.tasks import _shutdown_event
```

Add as the first line inside `create_scan()` function (before the admission lock):
```python
    if _shutdown_event.is_set():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server is shutting down. Try again later.",
        )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose exec backend python -m pytest tests/test_shutdown.py -v -p no:cacheprovider`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/tasks.py backend/app/main.py backend/app/api/routes/scans.py backend/tests/test_shutdown.py
git commit -m "feat: add graceful shutdown with 10s drain and 503 rejection"
```

### Task 5: Health Check Expansion

**Files:**
- Modify: `backend/app/api/routes/health.py`
- Modify: `backend/tests/test_api.py` (update existing health test)
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write failing tests in `backend/tests/test_health.py`**

```python
import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


def _mock_trivy_healthy(*args, **kwargs):
    """Return a mock process with returncode 0 (Trivy available)."""
    proc = AsyncMock()
    proc.returncode = 0
    proc.wait = AsyncMock(return_value=0)
    return proc


@pytest.mark.asyncio
async def test_health_returns_all_components(client: AsyncClient):
    with patch(
        "app.api.routes.health.asyncio.create_subprocess_exec",
        AsyncMock(side_effect=_mock_trivy_healthy),
    ):
        resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "database" in data
    assert "redis" in data
    assert "trivy" in data


@pytest.mark.asyncio
async def test_health_redis_unavailable_still_200(client: AsyncClient):
    with (
        patch(
            "app.api.routes.health._get_client",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.api.routes.health.asyncio.create_subprocess_exec",
            AsyncMock(side_effect=_mock_trivy_healthy),
        ),
    ):
        resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["redis"] == "unavailable"
    assert data["status"] == "healthy"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec backend python -m pytest tests/test_health.py -v -p no:cacheprovider`
Expected: FAIL (health endpoint doesn't return redis/trivy fields yet)

- [ ] **Step 3: Rewrite `backend/app/api/routes/health.py`**

```python
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
```

- [ ] **Step 4: Run health tests**

Run: `docker compose exec backend python -m pytest tests/test_health.py -v -p no:cacheprovider`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS (the old health test in test_api.py should still pass since it checks for 503 on broken DB)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/health.py backend/tests/test_health.py
git commit -m "feat: expand health check to cover DB, Redis, and Trivy"
```

## Chunk 3: Database Indexes, Lint

### Task 6: Add Database Indexes

**Files:**
- Modify: `backend/app/models/scan.py:29` (add indexes to model)
- Create: new Alembic migration

- [ ] **Step 1: Add indexes to model in `backend/app/models/scan.py`**

Replace line 29:
```python
    __table_args__ = (Index("idx_image_status", "image_name", "scan_status"),)
```

With:
```python
    __table_args__ = (
        Index("idx_image_status", "image_name", "scan_status"),
        Index("idx_scan_status", "scan_status"),
        Index("idx_status_created", "scan_status", ScanResult.created_at.desc()),
    )
```

- [ ] **Step 2: Generate Alembic migration**

Run: `docker compose exec backend alembic revision --autogenerate -m "add scan_status and status_created indexes"`

- [ ] **Step 3: Apply migration**

Run: `docker compose exec backend alembic upgrade head`
Expected: Migration applies successfully

- [ ] **Step 4: Run full test suite**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/scan.py backend/alembic/versions/
git commit -m "feat: add database indexes for scan_status and pagination queries"
```

### Task 7: Lint and Format Cleanup

**Files:**
- Any files flagged by ruff or ESLint

- [ ] **Step 1: Run ruff check and fix**

Run: `docker compose exec backend python -m ruff check . --fix -p no:cacheprovider`

- [ ] **Step 2: Run ruff format**

Run: `docker compose exec backend python -m ruff format . -p no:cacheprovider`

- [ ] **Step 3: Run ESLint**

Run: `cd frontend && npm run lint`

- [ ] **Step 4: Run full backend test suite**

Run: `docker compose exec backend python -m pytest tests/ -v -p no:cacheprovider 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Run frontend build check**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit if any changes**

```bash
git add -A
git commit -m "chore: fix lint and format issues"
```

### Task 8: Final Verification

- [ ] **Step 1: Run full backend test suite with coverage**

Run: `docker compose exec backend python -m pytest tests/ --cov --cov-report=term -p no:cacheprovider`
Expected: All tests PASS, coverage >= 70%

- [ ] **Step 2: Run ruff check (no fixes)**

Run: `docker compose exec backend python -m ruff check . -p no:cacheprovider`
Expected: All checks passed

- [ ] **Step 3: Run ruff format check**

Run: `docker compose exec backend python -m ruff format --check . -p no:cacheprovider`
Expected: All files already formatted

- [ ] **Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No warnings or errors

- [ ] **Step 5: Verify health endpoint works**

Run: `curl -s http://localhost:8000/api/v1/health | python -m json.tool`
Expected: JSON with database, redis, trivy status fields
