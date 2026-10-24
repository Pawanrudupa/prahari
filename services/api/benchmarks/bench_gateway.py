"""Benchmark script measuring Gateway tool-call pipeline latency against the 50 ms p95 target."""

import asyncio
import contextlib
import json
import os
import sqlite3
import statistics
import sys
import time
from typing import Any
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.auth.service import generate_api_key
from app.core.config import settings
from app.gateway.pipeline import execute_gateway_pipeline, get_fallback_policy
from app.gateway.schemas import ToolCallRequest
from app.models import Base
from app.models.agent import Agent, AgentToolGrant
from app.models.tool import Tool
from app.rag.service import search_policy_corpus

sqlite3.register_adapter(list, json.dumps)


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


@compiles(TSVECTOR, "sqlite")
def _compile_tsvector_sqlite(type_: object, compiler: object, **kw: object) -> str:
    return "TEXT"


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
                return url.set(database="prahari_bench").render_as_string(hide_password=False)
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

        for maint_db in ("prahari", "postgres"):
            try:
                maint_url = url.set(database=maint_db).render_as_string(hide_password=False)
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


async def run_benchmark(num_requests: int = 200) -> dict[str, Any]:
    """Run sequential tool call requests and compute latency percentiles."""
    db_url = get_benchmark_db_url()
    is_postgres = bool(db_url and ("postgres" in db_url))

    if is_postgres:
        assert_safe_benchmark_database(db_url)
        await _ensure_postgres_db_exists(db_url)
        safe_url = db_url.split("@")[-1] if "@" in db_url else db_url
        print(f"Running benchmark against real PostgreSQL: {safe_url}")
        init_engine = create_async_engine(db_url, isolation_level="AUTOCOMMIT")
        async with init_engine.connect() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))
                await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await init_engine.dispose()

        engine = create_async_engine(
            db_url,
            echo=False,
            pool_size=25,
            max_overflow=25,
            pool_timeout=60.0,
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    else:
        print("Running benchmark against in-memory SQLite fallback")
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Redis connection if available
    redis_url = os.environ.get("REDIS_URL") or settings.REDIS_URL
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
    stage_breakdown: dict[str, list[float]] = {
        "auth_ms": [],
        "grants_ms": [],
        "stubs_ms": [],
        "policy_ms": [],
        "limits_ms": [],
        "audit_ms": [],
        "events_ms": [],
        "relational_persist_ms": [],
        "stage6_lock_wait_ms": [],
        "stage6_query_prev_ms": [],
        "stage6_hash_compute_ms": [],
        "stage6_insert_ms": [],
        "stage6_commit_ms": [],
        "stage6_checkpoint_ms": [],
    }

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

    # 3. Measured run (sequential num_requests)
    t_bench_start = time.perf_counter()
    for i in range(num_requests):
        req = ToolCallRequest(
            agent_key=key_info.full_key,
            session_id=uuid4(),
            tool="crm.read_ticket",
            args={"ticket_id": f"TCK-{i}"},
        )
        async with session_maker() as session:
            start = time.perf_counter()
            resp = await execute_gateway_pipeline(session, redis_client, req, active_policy=policy)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            latencies_ms.append(elapsed_ms)
            if resp.stage_timings:
                for k, v in resp.stage_timings.items():
                    if k in stage_breakdown:
                        stage_breakdown[k].append(v)
    wall_time_sec = time.perf_counter() - t_bench_start
    throughput_ops_sec = num_requests / wall_time_sec if wall_time_sec > 0 else 0.0

    # 4. Measured run (20-way concurrent num_requests)
    concurrent_latencies_ms: list[float] = []
    concurrent_stage_breakdown: dict[str, list[float]] = {
        k: [] for k in stage_breakdown
    }
    sem = asyncio.Semaphore(20)

    async def _concurrent_worker(req_idx: int) -> None:
        c_req = ToolCallRequest(
            agent_key=key_info.full_key,
            session_id=uuid4(),
            tool="crm.read_ticket",
            args={"ticket_id": f"CONC-{req_idx}"},
        )
        async with sem, session_maker() as c_session:
            c_start = time.perf_counter()
            c_resp = await execute_gateway_pipeline(
                c_session, redis_client, c_req, active_policy=policy
            )
            c_elapsed = (time.perf_counter() - c_start) * 1000.0
            concurrent_latencies_ms.append(c_elapsed)
            if c_resp.stage_timings:
                for k, v in c_resp.stage_timings.items():
                    if k in concurrent_stage_breakdown:
                        concurrent_stage_breakdown[k].append(v)

    t_conc_start = time.perf_counter()
    await asyncio.gather(*[_concurrent_worker(i) for i in range(num_requests)])
    conc_wall_sec = time.perf_counter() - t_conc_start
    conc_throughput_ops_sec = num_requests / conc_wall_sec if conc_wall_sec > 0 else 0.0

    # Phase 3: Load-Interference Benchmark (Gateway p95 under concurrent RAG search traffic)
    # Warm up RAG embedding model and search pipeline to avoid cold-start penalty
    with contextlib.suppress(Exception):
        async with session_maker() as rag_session:
            await search_policy_corpus(
                rag_session,
                query="warmup test query",
                top_k=2,
            )

    interference_latencies_ms: list[float] = []
    stop_rag_bg = asyncio.Event()

    async def _rag_background_worker() -> None:
        while not stop_rag_bg.is_set():
            with contextlib.suppress(Exception):
                async with session_maker() as rag_session:
                    await search_policy_corpus(
                        rag_session,
                        query="payment threshold authorization limits",
                        top_k=3,
                    )
            await asyncio.sleep(0.05)

    rag_task = asyncio.create_task(_rag_background_worker())
    try:
        for i in range(50):
            req = ToolCallRequest(
                agent_key=key_info.full_key,
                session_id=uuid4(),
                tool="crm.read_ticket",
                args={"ticket_id": f"TCK-INTERF-{i}"},
            )
            t0 = time.perf_counter()
            async with session_maker() as s:
                await execute_gateway_pipeline(s, redis_client, req, active_policy=policy)
            elapsed = (time.perf_counter() - t0) * 1000.0
            interference_latencies_ms.append(elapsed)
    finally:
        stop_rag_bg.set()
        await rag_task

    # Clean up benchmark data on teardown
    if is_postgres:
        assert_safe_benchmark_database(db_url)
        async with engine.begin() as conn:
            with contextlib.suppress(Exception):
                await conn.execute(
                    text(
                        "TRUNCATE TABLE agent_tool_grants, agents, tools, "
                        "audit_log, audit_checkpoints, sessions, actions, "
                        "decisions, approvals CASCADE"
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

    stages_summary: dict[str, dict[str, float]] = {}
    for stage_name, vals in stage_breakdown.items():
        if vals:
            sorted_v = sorted(vals)
            s_p50 = sorted_v[int(0.50 * len(sorted_v))]
            s_p95 = sorted_v[int(0.95 * len(sorted_v))]
            stages_summary[stage_name] = {
                "mean": statistics.mean(vals),
                "p50": s_p50,
                "p95": s_p95,
            }

    c_latencies_sorted = sorted(concurrent_latencies_ms)
    c_p50 = c_latencies_sorted[int(0.50 * len(c_latencies_sorted))]
    c_p90 = c_latencies_sorted[int(0.90 * len(c_latencies_sorted))]
    c_p95 = c_latencies_sorted[int(0.95 * len(c_latencies_sorted))]
    c_p99 = c_latencies_sorted[int(0.99 * len(c_latencies_sorted))]

    c_stages_summary: dict[str, dict[str, float]] = {}
    for stage_name, vals in concurrent_stage_breakdown.items():
        if vals:
            sorted_v = sorted(vals)
            c_stages_summary[stage_name] = {
                "mean": statistics.mean(vals),
                "p50": sorted_v[int(0.50 * len(sorted_v))],
                "p95": sorted_v[int(0.95 * len(sorted_v))],
            }

    interf_sorted = sorted(interference_latencies_ms) if interference_latencies_ms else [0.0]
    interf_p50 = interf_sorted[int(0.50 * len(interf_sorted))]
    interf_p95 = interf_sorted[int(0.95 * len(interf_sorted))]

    return {
        "count": float(num_requests),
        "min": min(latencies_ms),
        "mean": statistics.mean(latencies_ms),
        "p50": latencies_sorted[p50_idx],
        "p90": latencies_sorted[p90_idx],
        "p95": latencies_sorted[p95_idx],
        "p99": latencies_sorted[p99_idx],
        "max": max(latencies_ms),
        "wall_time_sec": wall_time_sec,
        "throughput_ops_sec": throughput_ops_sec,
        "stages": stages_summary,
        "concurrent": {
            "concurrency": 20,
            "min": min(concurrent_latencies_ms),
            "mean": statistics.mean(concurrent_latencies_ms),
            "p50": c_p50,
            "p90": c_p90,
            "p95": c_p95,
            "p99": c_p99,
            "max": max(concurrent_latencies_ms),
            "wall_time_sec": conc_wall_sec,
            "throughput_ops_sec": conc_throughput_ops_sec,
            "stages": c_stages_summary,
        },
        "load_interference": {
            "count": len(interference_latencies_ms),
            "mean": (
                statistics.mean(interference_latencies_ms)
                if interference_latencies_ms
                else 0.0
            ),
            "p50": interf_p50,
            "p95": interf_p95,
        },
    }


def main() -> None:
    print("=" * 68)
    print("Prahari Gateway Pipeline Latency & Throughput Benchmark")
    print("Optimization: Single-Transaction, Reduced Round-trips, App Hashing")
    print("=" * 68)

    results = asyncio.run(run_benchmark(200))

    print("\n[1] SEQUENTIAL EXECUTION BENCHMARK (N=200)")
    print(f"Total Requests     : {int(results['count'])}")
    print(f"Total Wall Time    : {results['wall_time_sec']:.2f} s")
    print(f"Throughput         : {results['throughput_ops_sec']:.2f} ops/sec")
    print(f"Min Latency        : {results['min']:.2f} ms")
    print(f"Mean Latency       : {results['mean']:.2f} ms")
    print(f"p50 (Median)       : {results['p50']:.2f} ms")
    print(f"p90 Latency        : {results['p90']:.2f} ms")
    print(f"p95 Latency        : {results['p95']:.2f} ms")
    print(f"p99 Latency        : {results['p99']:.2f} ms")
    print(f"Max Latency        : {results['max']:.2f} ms")
    print("-" * 68)

    stages: dict[str, dict[str, float]] = results.get("stages", {})
    if stages:
        print("Sequential Stage-Level & Stage 6 Sub-Stage Timing Breakdown:")
        print(f"  {'Stage / Sub-Stage':<28} | {'Mean':<10} | {'p50':<10} | {'p95':<10}")
        print(f"  {'-'*28}-+-{'-'*10}-+-{'-'*10}-+-{'-'*10}")
        for s_name, s_data in stages.items():
            mean_v = s_data["mean"]
            p50_v = s_data["p50"]
            p95_v = s_data["p95"]
            print(
                f"  {s_name:<28} | {mean_v:>7.2f} ms | "
                f"{p50_v:>7.2f} ms | {p95_v:>7.2f} ms"
            )
        print("-" * 68)

    conc: dict[str, Any] = results.get("concurrent", {})
    if conc:
        c_conc = conc["concurrency"]
        print(f"\n[2] 20-WAY CONCURRENT BENCHMARK (N=200, Concurrency={c_conc})")
        print(f"Total Requests     : {int(results['count'])}")
        print(f"Total Wall Time    : {conc['wall_time_sec']:.2f} s")
        print(f"Throughput         : {conc['throughput_ops_sec']:.2f} ops/sec")
        print(f"Min Latency        : {conc['min']:.2f} ms")
        print(f"Mean Latency       : {conc['mean']:.2f} ms")
        print(f"p50 (Median)       : {conc['p50']:.2f} ms")
        print(f"p90 Latency        : {conc['p90']:.2f} ms")
        print(f"p95 Latency        : {conc['p95']:.2f} ms")
        print(f"p99 Latency        : {conc['p99']:.2f} ms")
        print(f"Max Latency        : {conc['max']:.2f} ms")
        print("-" * 68)

        c_stages: dict[str, dict[str, float]] = conc.get("stages", {})
        if c_stages:
            print("Concurrent Stage-Level & Stage 6 Sub-Stage Timing Breakdown:")
            print(f"  {'Stage / Sub-Stage':<28} | {'Mean':<10} | {'p50':<10} | {'p95':<10}")
            print(f"  {'-'*28}-+-{'-'*10}-+-{'-'*10}-+-{'-'*10}")
            for s_name, s_data in c_stages.items():
                mean_v = s_data["mean"]
                p50_v = s_data["p50"]
                p95_v = s_data["p95"]
                print(
                    f"  {s_name:<28} | {mean_v:>7.2f} ms | "
                    f"{p50_v:>7.2f} ms | {p95_v:>7.2f} ms"
                )
            print("-" * 68)

    interf: dict[str, Any] = results.get("load_interference", {})
    if interf:
        print("\n[3] LOAD-INTERFERENCE BENCHMARK (Sequential Tool Calls + Concurrent RAG Traffic)")
        print(f"Total Requests     : {int(interf['count'])}")
        print(f"Mean Latency       : {interf['mean']:.2f} ms")
        print(f"p50 (Median)       : {interf['p50']:.2f} ms")
        print(f"p95 Latency        : {interf['p95']:.2f} ms")
        print("-" * 68)

    p95 = results["p95"]
    interf_p95 = interf.get("p95", 0.0) if interf else 0.0

    if p95 < 50.0 and interf_p95 < 50.0:
        print(
            f"\nRESULT: PASS - Sequential p95 ({p95:.2f} ms) and Interference p95 "
            f"({interf_p95:.2f} ms) are within the 50 ms budget!"
        )
        print("=" * 68)
    else:
        print(
            f"\nRESULT: FAIL - Sequential p95 ({p95:.2f} ms) or Interference p95 "
            f"({interf_p95:.2f} ms) exceeded the 50 ms budget!"
        )
        print("=" * 68)
        sys.exit(1)


if __name__ == "__main__":
    main()
