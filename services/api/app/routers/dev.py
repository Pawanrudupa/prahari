"""Development-only endpoints for simulation control and test automation."""

import asyncio
import contextlib
import sys
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.redis import redis_client

# Ensure repository root is on sys.path for services.simulator import
repo_root = str(Path(__file__).resolve().parents[4])
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from services.simulator.runner import SimulationRunner  # noqa: E402

router = APIRouter(prefix="/v1/dev", tags=["dev"])

SIMULATE_LOCK_KEY = "prahari:dev:simulate:lock"
SIMULATE_LOCK_TTL_SECONDS = 120

_simulate_lock = asyncio.Lock()


class DistributedSimulateLock:
    """
    Distributed Redis-backed lock for /v1/dev/simulate ensuring single active run across workers.
    Includes TTL auto-expiry to release on worker crash/timeout.
    Gracefully falls back to process-level asyncio.Lock if Redis is unavailable.
    """

    def __init__(self, key: str = SIMULATE_LOCK_KEY, ttl: int = SIMULATE_LOCK_TTL_SECONDS):
        self.key = key
        self.ttl = ttl
        self._acquired_redis = False

    async def acquire(self) -> bool:
        # Check in-memory lock first
        if _simulate_lock.locked():
            return False

        # Attempt Redis distributed lock (SET NX EX)
        try:
            res = await redis_client.set(self.key, "locked", nx=True, ex=self.ttl)
            if not res:
                return False
            self._acquired_redis = True
        except Exception:
            # Redis is unreachable (e.g. SQLite offline dev/test) - fallback to in-memory lock
            pass

        # Also acquire in-memory lock for local thread/task safety
        await _simulate_lock.acquire()
        return True

    async def release(self) -> None:
        if self._acquired_redis:
            self._acquired_redis = False
            with contextlib.suppress(Exception):
                await redis_client.delete(self.key)
        if _simulate_lock.locked():
            _simulate_lock.release()

    async def is_locked(self) -> bool:
        if _simulate_lock.locked():
            return True
        try:
            val = await redis_client.get(self.key)
            return val is not None
        except Exception:
            return False


class DevSimulateRequest(BaseModel):
    scenario: str = Field(
        default="all",
        description="Scenario to run: benign, injection, pii, loop, privilege, bulk_export, all",
    )
    count: int = Field(
        default=20,
        ge=1,
        le=500,
        description="Number of calls to generate and dispatch (max 500)",
    )
    seed: int = Field(
        default=42,
        description="Random seed for deterministic generation",
    )
    stress: bool = Field(
        default=False,
        description="Whether to provision stress nodes (up to 200 nodes)",
    )


class DevSimulateResponse(BaseModel):
    scenario: str
    count: int
    seed: int
    summary: dict[str, int]
    decisions: list[dict[str, Any]]


@router.post("/simulate", response_model=DevSimulateResponse)
async def dev_simulate(request: Request, body: DevSimulateRequest) -> DevSimulateResponse:
    """
    Trigger synthetic agent traffic simulation directly from the console.

    Available strictly in development and test environments; returns HTTP 404 in production.
    Enforces single-run concurrency via async lock (returns HTTP 409 if a simulation is active).
    """
    if settings.ENV not in ("development", "test"):
        raise HTTPException(status_code=404, detail="Endpoint not found")

    lock = DistributedSimulateLock()
    acquired = await lock.acquire()
    if not acquired:
        raise HTTPException(
            status_code=409,
            detail="A simulation is already in progress",
        )

    try:
        transport = httpx.ASGITransport(app=request.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
            timeout=60.0,
        ) as sim_client:
            runner = SimulationRunner(
                api_url="http://testserver",
                admin_token=settings.ADMIN_TOKEN,
                seed=body.seed,
                rate=0.0,
            )

            decisions = await runner.run(
                scenario=body.scenario,
                count=body.count,
                stress=body.stress,
                client=sim_client,
            )
    finally:
        await lock.release()

    summary: dict[str, int] = {
        "allow": 0,
        "redact": 0,
        "escalate": 0,
        "deny": 0,
    }
    for item in decisions:
        dec = str(item.get("decision", "")).lower()
        if dec in summary:
            summary[dec] += 1

    return DevSimulateResponse(
        scenario=body.scenario,
        count=len(decisions),
        seed=body.seed,
        summary=summary,
        decisions=decisions,
    )
