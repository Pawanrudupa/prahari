"""Benchmark script measuring Gateway tool-call pipeline latency against the 50 ms p95 target."""

import asyncio
import contextlib
import os
import statistics
import sys
import time
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.auth.service import generate_api_key
from app.gateway.pipeline import execute_gateway_pipeline, get_fallback_policy
from app.gateway.schemas import ToolCallRequest
from app.models import Base
from app.models.agent import Agent, AgentToolGrant
from app.models.tool import Tool


# SQLite compatibility for Postgres-specific types during benchmark
@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_: object, compiler: object, **kw: object) -> str:
    return "TEXT"


@compiles(Vector, "sqlite")
def _compile_vector_sqlite(type_: object, compiler: object, **kw: object) -> str:
    return "TEXT"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_: object, compiler: object, **kw: object) -> str:
    return "JSON"


def get_benchmark_db_url() -> str:
    """Resolve dedicated benchmark database URL, preferring dedicated prahari_bench."""
    if os.environ.get("BENCH_DATABASE_URL"):
        return os.environ["BENCH_DATABASE_URL"]
    if os.environ.get("TEST_DATABASE_URL"):
        return os.environ["TEST_DATABASE_URL"]
    base_url = os.environ.get("DATABASE_URL", "")
    if base_url and "postgres" in base_url:
        try:
            url = make_url(base_url)
            # Default to isolated prahari_bench database
            if url.database == "prahari":
                return str(url.set(database="prahari_bench"))
            return base_url
        except Exception:
            return base_url
    return "sqlite+aiosqlite:///:memory:"


def assert_safe_benchmark_database(db_url: str) -> None:
    """
    SAFETY INVARIANT:
    Refuse to truncate tables unless database name contains 'test' or 'bench',
    or ALLOW_BENCH_TRUNCATE=true is explicitly provided.
    """
    if os.environ.get("ALLOW_BENCH_TRUNCATE", "").lower() in ("true", "1", "yes"):
        return

    try:
        url = make_url(db_url)
        db_name = (url.database or "").lower()
    except Exception:
        db_name = db_url.split("/")[-1].split("?")[0].lower()

    if "test" in db_name or "bench" in db_name:
        return

    raise RuntimeError(
        f"BENCHMARK SAFETY ABORT: Truncate refused on database '{db_name}'. "
        "Benchmark database name must contain 'test' or 'bench' to prevent accidental "
        "data loss on primary databases. Set ALLOW_BENCH_TRUNCATE=true to override."
    )


async def _ensure_postgres_db_exists(target_url: str) -> None:
    """Ensure dedicated benchmark database exists on the target PostgreSQL server."""
    try:
        url = make_url(target_url)
        db_name = url.database
        if not db_name or not ("test" in db_name or "bench" in db_name):
            return

        for maint_db in ("postgres", "prahari"):
            try:
                maint_url = str(url.set(database=maint_db))
                maint_engine = create_async_engine(maint_url, isolation_level="AUTOCOMMIT")
                async with maint_engine.connect() as conn:
                    res = await conn.execute(
                        text("SELECT 1 FROM pg_database WHERE datname = :name"),
                        {"name": db_name},
                    )
                    if not res.scalar():
                        await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                await maint_engine.dispose()
                return
            except Exception:
                continue
    except Exception:
        pass


async def run_benchmark(num_requests: int = 200) -> dict[str, float]:
    """Run sequential tool call requests and compute latency percentiles."""
    db_url = get_benchmark_db_url()
    is_postgres = bool(db_url and ("postgres" in db_url))

    if is_postgres:
        assert_safe_benchmark_database(db_url)
        await _ensure_postgres_db_exists(db_url)
        safe_url = db_url.split("@")[-1] if "@" in db_url else db_url
        print(f"Running benchmark against real PostgreSQL: {safe_url}")
        engine = create_async_engine(db_url, echo=False)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
            # Isolate benchmark data from any prior test data
            await conn.execute(
                text(
                    "TRUNCATE TABLE agent_tool_grants, agents, tools, "
                    "audit_log, audit_checkpoints CASCADE"
                )
            )

    else:
        print("Running benchmark against in-memory SQLite fallback")
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Redis connection if available
    redis_url = os.environ.get("REDIS_URL")
    redis_client = None
    if redis_url:
        try:
            from redis.asyncio import from_url

            r = from_url(redis_url)
            await r.ping()
            redis_client = r
            print(f"Connected to real Redis: {redis_url}")
        except Exception:
            redis_client = None

    # 1. Setup test agent
    key_info = generate_api_key()
    async with session_maker() as session:
        agent = Agent(
            id=uuid4(),
            name="Bench Agent",
            owner="Performance Team",
            role="support",
            api_key_prefix=key_info.prefix,
            api_key_hash=key_info.hashed,
            status="active",
        )
        session.add(agent)

        stmt = select(Tool).where(Tool.name == "crm.read_ticket")
        existing_tool = (await session.execute(stmt)).scalar_one_or_none()
        if existing_tool:
            tool = existing_tool
        else:
            tool = Tool(
                id=uuid4(),
                name="crm.read_ticket",
                server="crm-mcp",
                sensitivity="normal",
            )
            session.add(tool)

        await session.flush()

        grant = AgentToolGrant(agent_id=agent.id, tool_id=tool.id)
        session.add(grant)
        await session.commit()

    policy = get_fallback_policy()
    latencies_ms: list[float] = []

    # 2. Warm up (10 requests)
    for i in range(10):
        req = ToolCallRequest(
            agent_key=key_info.full_key,
            session_id=uuid4(),
            tool="crm.read_ticket",
            args={"ticket_id": f"TCK-{i}"},
        )
        async with session_maker() as session:
            await execute_gateway_pipeline(session, redis_client, req, active_policy=policy)

    # 3. Measured run (num_requests)
    for i in range(num_requests):
        req = ToolCallRequest(
            agent_key=key_info.full_key,
            session_id=uuid4(),
            tool="crm.read_ticket",
            args={"ticket_id": f"TCK-{i}"},
        )
        async with session_maker() as session:
            start = time.perf_counter()
            await execute_gateway_pipeline(session, redis_client, req, active_policy=policy)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            latencies_ms.append(elapsed_ms)

    # Clean up benchmark data on teardown
    if is_postgres:
        assert_safe_benchmark_database(db_url)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(
                    text(
                        "TRUNCATE TABLE agent_tool_grants, agents, tools, "
                        "audit_log, audit_checkpoints CASCADE"
                    )
                )

    if redis_client is not None:
        await redis_client.aclose()
    await engine.dispose()

    latencies_sorted = sorted(latencies_ms)
    p50_idx = int(0.50 * len(latencies_sorted))
    p90_idx = int(0.90 * len(latencies_sorted))
    p95_idx = int(0.95 * len(latencies_sorted))
    p99_idx = int(0.99 * len(latencies_sorted))

    return {
        "count": float(num_requests),
        "min": min(latencies_ms),
        "mean": statistics.mean(latencies_ms),
        "p50": latencies_sorted[p50_idx],
        "p90": latencies_sorted[p90_idx],
        "p95": latencies_sorted[p95_idx],
        "p99": latencies_sorted[p99_idx],
        "max": max(latencies_ms),
    }


def main() -> None:
    print("=" * 60)
    print("Prahari Gateway Pipeline Latency Benchmark (Target: p95 < 50ms)")
    print("=" * 60)

    results = asyncio.run(run_benchmark(200))

    print(f"Total Requests  : {int(results['count'])}")
    print(f"Min Latency     : {results['min']:.2f} ms")
    print(f"Mean Latency    : {results['mean']:.2f} ms")
    print(f"p50 (Median)    : {results['p50']:.2f} ms")
    print(f"p90 Latency     : {results['p90']:.2f} ms")
    print(f"p95 Latency     : {results['p95']:.2f} ms")
    print(f"p99 Latency     : {results['p99']:.2f} ms")
    print(f"Max Latency     : {results['max']:.2f} ms")
    print("-" * 60)

    p95 = results["p95"]
    if p95 < 50.0:
        print(f"RESULT: PASS - p95 ({p95:.2f} ms) is well within the 50 ms budget!")
        print("=" * 60)
    else:
        print(f"RESULT: FAIL - p95 ({p95:.2f} ms) exceeds the 50 ms budget!")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()
