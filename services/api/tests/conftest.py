import contextlib
import os
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from pgvector.sqlalchemy import Vector
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.auth.session import create_session_token
from app.core.config import settings
from app.core.database import get_db
from app.main import create_app
from app.models import Base

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
IS_POSTGRES = bool(TEST_DB_URL and ("postgres" in TEST_DB_URL))


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Enforce that CI runs against real Postgres and fails if skipped."""
    is_ci = bool(os.environ.get("CI") or os.environ.get("REQUIRE_POSTGRES"))

    if is_ci and not IS_POSTGRES:
        pytest.fail(
            "CI FAILURE: CI requires tests to run against real PostgreSQL and Redis. "
            "DATABASE_URL is not configured for PostgreSQL."
        )

    # In local development without Postgres, skip tests marked with @pytest.mark.postgres
    if not IS_POSTGRES:
        skip_pg = pytest.mark.skip(
            reason="Real PostgreSQL/Redis not available locally (set DATABASE_URL to run)"
        )
        for item in items:
            if "postgres" in item.keywords:
                item.add_marker(skip_pg)


# Teach SQLite how to handle Postgres-specific types during tests
@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "TEXT"


@compiles(Vector, "sqlite")
def _compile_vector_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "TEXT"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "JSON"


TABLES_TO_TRUNCATE = [
    "audit_checkpoints",
    "audit_log",
    "approvals",
    "decisions",
    "actions",
    "incidents",
    "sessions",
    "agent_tool_grants",
    "agents",
    "tools",
    "budgets",
    "redteam_runs",
    "policy_chunks",
    "policy_documents",
    "policy_versions",
    "policies",
]


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an isolated test database session (Real Postgres in CI, SQLite in local dev)."""
    if IS_POSTGRES:
        engine = create_async_engine(TEST_DB_URL, echo=False)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
            with contextlib.suppress(Exception):
                truncate_sql = f"TRUNCATE TABLE {', '.join(TABLES_TO_TRUNCATE)} CASCADE;"
                await conn.execute(text(truncate_sql))

        session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_maker() as session:
            yield session

        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                truncate_sql = f"TRUNCATE TABLE {', '.join(TABLES_TO_TRUNCATE)} CASCADE;"
                await conn.execute(text(truncate_sql))
        await engine.dispose()
    else:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            echo=False,
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_maker() as session:
            yield session

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Provide an HTTP test client with database dependency overridden."""
    app = create_app()

    async def _get_test_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """Provide admin authorization headers matching settings.ADMIN_TOKEN."""
    return {"Authorization": f"Bearer {settings.ADMIN_TOKEN}"}


@pytest.fixture
def session_headers() -> dict[str, str]:
    """Provide valid web session token authorization headers."""
    token = create_session_token(role="admin", mode="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _configure_test_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set default test settings:
    allow tests without Redis to proceed in fail-open degraded mode.
    """
    monkeypatch.setattr(settings, "LIMITS_FAIL_OPEN", True)


@pytest.fixture(autouse=True)
async def _ensure_redis_clean_pool() -> AsyncIterator[None]:
    """Ensure Redis connection pool resets stale connections across tests."""
    from app.core.redis import redis_client

    if redis_client is not None:
        with contextlib.suppress(Exception):
            await redis_client.connection_pool.disconnect()
    yield
    if redis_client is not None:
        with contextlib.suppress(Exception):
            await redis_client.connection_pool.disconnect()
