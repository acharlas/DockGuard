import json
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.session import get_db
from app.main import app
from app.models.scan import Base
from app.services import cache as cache_module
from app.services import scanner as scanner_module
from app.services import subprocesses as subprocesses_module

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def trivy_report():
    return json.loads((FIXTURES / "trivy_nginx.json").read_text())


@pytest.fixture
def dive_report():
    return json.loads((FIXTURES / "dive_nginx.json").read_text())


@pytest.fixture
async def session_factory(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    original_async_session = scanner_module.async_session
    scanner_module.async_session = factory
    yield factory
    scanner_module.async_session = original_async_session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(session_factory) -> AsyncSession:
    async with session_factory() as session:
        yield session


@pytest.fixture
async def client(session_factory):
    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_global_state():
    def discard_background_task(coro):
        coro.close()
        return None

    with patch(
        "app.api.routes.scans.create_background_task",
        side_effect=discard_background_task,
    ):
        cache_module._client = None
        subprocesses_module.running_processes.clear()
        yield
        cache_module._client = None
        subprocesses_module.running_processes.clear()
