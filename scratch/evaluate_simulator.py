"""Scenario evaluation and seed determinism diff runner for Prahari simulator."""

import asyncio
import os
import sys
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

# Ensure repo root and services/api are in sys.path
REPO_ROOT = Path("c:/Users/PAWAN/prahari")
API_DIR = REPO_ROOT / "services" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import httpx
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db
from app.limits.service import in_memory_tracker
from app.main import create_app
from app.models import Base
from services.simulator.runner import SimulationRunner

# Teach SQLite how to handle Postgres-specific types during tests/eval
@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "TEXT"

@compiles(Vector, "sqlite")
def _compile_vector_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "TEXT"

@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_: Any, compiler: Any, **kw: Any) -> str:
    return "JSON"


async def run_single_simulation(seed: int) -> dict[str, list[dict[str, Any]]]:
    """Execute all scenarios in an isolated, pristine state with the given seed."""
    settings.LIMITS_FAIL_OPEN = True
    in_memory_tracker.reset()

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = create_app()

    async def _get_test_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = _get_test_db

    transport = httpx.ASGITransport(app=app)
    results: dict[str, list[dict[str, Any]]] = {}

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        runner = SimulationRunner(api_url="http://test", admin_token=settings.ADMIN_TOKEN, seed=seed, rate=0)
        # Provision canonical agents/tools once for the run
        await runner.provision(client)

        for scenario in ["benign", "injection", "pii", "loop", "privilege"]:
            # For each scenario, reset runner log but keep provisioned agents
            runner.reset()
            # For loop scenario, run 8 calls so the limit breaker (threshold 5) is demonstrated
            count = 8 if scenario == "loop" else 4
            calls = await runner.run(scenario=scenario, count=count, client=client)
            results[scenario] = list(calls)

    await engine.dispose()
    app.dependency_overrides.clear()
    return results


async def main() -> None:
    print("Running Simulator Scenarios Evaluation (Seed 42)...", flush=True)
    results_run1 = await run_single_simulation(seed=42)
    results_run2 = await run_single_simulation(seed=42)

    print("\n" + "=" * 90, flush=True)
    print("SIMULATOR SCENARIOS: EXPECTED VS ACTUAL DECISIONS & RULES (Gate 3)", flush=True)
    print("=" * 90, flush=True)
    print(f"{'Scenario':<12} {'Agent':<14} {'Tool':<18} {'Expected':<10} {'Actual':<10} {'Rule ID / Reason'}", flush=True)
    print("-" * 90, flush=True)

    expected_rules = {
        "benign": ("allow", "R1-allow-read-tickets"),
        "injection": ("deny", "R4-deny-untrusted-instruction"),
        "pii": ("redact", "R2-redact-pii-outbound"),
        "privilege": ("deny", "tool_not_granted"),
    }

    for scenario, calls in results_run1.items():
        if scenario == "loop":
            # For loop, show initial call and tripped call
            c_init = calls[0]
            c_tripped = calls[5]  # 6th call
            print(f"{'loop (call 1)':<12} {c_init['agent']:<14} {c_init['tool']:<18} {'allow':<10} {c_init['decision']:<10} {c_init['rule_id']}", flush=True)
            print(f"{'loop (call 6)':<12} {c_tripped['agent']:<14} {c_tripped['tool']:<18} {'deny':<10} {c_tripped['decision']:<10} {c_tripped['reason']}", flush=True)
        else:
            exp_dec, exp_rule = expected_rules.get(scenario, ("unknown", "unknown"))
            for call in calls[:2]:
                act_dec = call.get("decision", "unknown")
                act_rule = call.get("rule_id") or call.get("reason", "N/A")
                print(f"{scenario:<12} {call['agent']:<14} {call['tool']:<18} {exp_dec:<10} {act_dec:<10} {act_rule}", flush=True)

    print("=" * 90, flush=True)

    # Compute seed diff between run 1 and run 2 (both seed=42)
    diffs_same_seed = 0
    total_calls = 0
    for sc in results_run1:
        for idx, (c1, c2) in enumerate(zip(results_run1[sc], results_run2[sc], strict=False)):
            total_calls += 1
            if (c1["agent"], c1["tool"], c1["decision"], c1.get("rule_id"), c1.get("reason")) != (
                c2["agent"], c2["tool"], c2["decision"], c2.get("rule_id"), c2.get("reason")
            ):
                diffs_same_seed += 1
                print(f"DIFF [{sc} #{idx}]: Run 1: {c1} != Run 2: {c2}", flush=True)

    print("\nDETERMINISM & SEED DIFF VERIFICATION:", flush=True)
    print(f"Run 1 (Seed 42) vs Run 2 (Seed 42): Total Calls = {total_calls}, Differences = {diffs_same_seed}", flush=True)
    if diffs_same_seed == 0:
        print(">>> RESULT: ZERO DIFFERENCE between Run 1 and Run 2 with Seed 42 (100% Deterministic!)", flush=True)
    else:
        print(f">>> FAILED: {diffs_same_seed} differences found!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
