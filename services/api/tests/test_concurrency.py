"""Concurrency tests verifying serialized audit appends under parallel load."""

import asyncio
import contextlib
import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.audit.service import append_audit_log, build_audit_payload
from app.audit.verifier import verify_audit_chain
from app.models import Base


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_concurrent_50_parallel_appends() -> None:
    """
    Execute 50 parallel asynchronous appends to the audit log simultaneously.
    Verify that lock serialization prevents chain forks, sequence gaps,
    and produces an intact, 100% valid cryptographic hash chain of 50 records.
    """
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    is_postgres = bool(db_url and ("postgres" in db_url))

    from sqlalchemy.pool import NullPool

    if is_postgres:
        engine = create_async_engine(db_url, echo=False, poolclass=NullPool)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
    else:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def worker(worker_id: int) -> None:
        # Each worker acquires its own session to simulate concurrent requests
        async with session_maker() as session:
            payload = build_audit_payload(
                agent_id=uuid4(),
                tool=f"tool_worker_{worker_id}",
                args={"worker_id": worker_id, "data": f"content_{worker_id}"},
                data_classes=[],
                outcome="allow",
                reason=f"concurrent_test_worker_{worker_id}",
            )
            await append_audit_log(session, payload)

    # Launch 50 parallel coroutines
    tasks = [worker(i) for i in range(50)]
    await asyncio.gather(*tasks)

    # Verify that the entire chain of 50 records is contiguous and cryptographically intact
    async with session_maker() as verify_session:
        result = await verify_audit_chain(verify_session)
        assert result.valid is True
        assert result.total_records == 50
        assert result.broken_seq is None
        assert result.error is None

    async with engine.begin() as conn:
        if is_postgres:
            with contextlib.suppress(Exception):
                await conn.execute(text("TRUNCATE TABLE audit_log, audit_checkpoints CASCADE"))
        else:
            await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
