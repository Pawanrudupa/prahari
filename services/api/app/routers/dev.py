"""Development-only endpoints for simulation control and test automation."""

import asyncio
import sys
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings

# Ensure repository root is on sys.path for services.simulator import
repo_root = str(Path(__file__).resolve().parents[4])
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from services.simulator.runner import SimulationRunner  # noqa: E402

router = APIRouter(prefix="/v1/dev", tags=["dev"])

_simulate_lock = asyncio.Lock()


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

    if _simulate_lock.locked():
        raise HTTPException(
            status_code=409,
            detail="A simulation is already in progress",
        )

    async with _simulate_lock:
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
