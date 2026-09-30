"""Benchmark script measuring Gateway tool-call pipeline latency against the 50 ms p95 target."""

import asyncio
import contextlib
import os
import statistics
import time
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.auth.service import generate_api_key
from app.gateway.pipeline import execute_gateway_pipeline, get_fallback_policy
from app.gateway.schemas import ToolCallRequest
from app.models import Base
from app.models.agent import Agent


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


async def run_benchmark(num_requests: int = 200) -> dict[str, float]:
    """Run sequential tool call requests and compute latency percentiles."""
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    is_postgres = bool(db_url and ("postgres" in db_url))

    if is_postgres:
        safe_url = db_url.split("@")[-1] if "@" in db_url else db_url
        print(f"Running benchmark against real PostgreSQL: {safe_url}")
        engine = create_async_engine(db_url, echo=False)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
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
    else:
        print(f"RESULT: FAIL - p95 ({p95:.2f} ms) exceeds the 50 ms budget!")
    print("=" * 60)


if __name__ == "__main__":
    main()
