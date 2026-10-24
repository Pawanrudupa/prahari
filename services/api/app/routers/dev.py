"""Development-only endpoints for simulation control and test automation."""

import asyncio
import contextlib
import sys
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_admin_audit_event
from app.auth.admin import require_admin_token
from app.core.config import settings
from app.core.database import get_db
from app.core.redis import redis_client
from app.models.agent import Agent
from app.models.tool import Tool
from app.rag.service import DuplicateDocumentError, ingest_policy_document, list_policy_documents
from app.schemas.rag import LoadSampleDocsResponse, PolicyDocumentResponse

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


class ArchiveStressResponse(BaseModel):
    archived_agents: int
    archived_tools: int
    message: str


@router.post(
    "/archive-stress",
    response_model=ArchiveStressResponse,
    summary="Archive all stress test agents and tools (Dev only, Admin protected)",
    dependencies=[Depends(require_admin_token)],
)
async def dev_archive_stress(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ArchiveStressResponse:
    """
    Dev-only endpoint to archive stress agents and tools (status='archived').
    Strict invariant: Never deletes audit rows or decision history.
    """
    if settings.ENV not in ("development", "test"):
        raise HTTPException(status_code=404, detail="Endpoint not found")

    # 1. Query all stress agents (either tagged with 'stress' or named starting with 'Stress-')
    agents_res = await db.execute(
        select(Agent).where(
            or_(
                Agent.name.startswith("Stress-"),
                cast(Agent.tags, String).contains("stress"),
            ),
            Agent.status != "archived",
        )
    )
    agents = list(agents_res.scalars().all())
    for a in agents:
        a.status = "archived"

    # 2. Query all stress tools (either tagged with 'stress' or named starting with 'stress.')
    tools_res = await db.execute(
        select(Tool).where(
            or_(
                Tool.name.startswith("stress."),
                cast(Tool.tags, String).contains("stress"),
            ),
            Tool.status != "archived",
        )
    )
    tools = list(tools_res.scalars().all())
    for t in tools:
        t.status = "archived"

    await db.commit()

    # Append admin audit log
    await record_admin_audit_event(
        session=db,
        event_type="stress.archived",
        details={
            "archived_agents_count": len(agents),
            "archived_tools_count": len(tools),
        },
    )

    return ArchiveStressResponse(
        archived_agents=len(agents),
        archived_tools=len(tools),
        message=f"Successfully archived {len(agents)} stress agents and {len(tools)} stress tools.",
    )


@router.post(
    "/load-sample-docs",
    response_model=LoadSampleDocsResponse,
    summary="Load synthetic sample policy documents for RAG evaluation and demo",
)
async def dev_load_sample_docs(
    _: Annotated[str, Depends(require_admin_token)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoadSampleDocsResponse:
    """
    Ingest the 4 canonical synthetic policy documents from policies/examples/docs/.
    Skips documents that are already loaded.
    """
    if settings.ENV not in ("development", "test"):
        raise HTTPException(status_code=404, detail="Endpoint not found")

    docs_dir = Path(repo_root) / "policies" / "examples" / "docs"
    if not docs_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Docs directory not found at {docs_dir}")

    loaded_docs: list[PolicyDocumentResponse] = []
    skipped_count = 0
    loaded_count = 0

    for doc_path in sorted(docs_dir.glob("*.md")):
        content = doc_path.read_bytes()
        title = doc_path.stem.replace("-", " ").title()
        filename = doc_path.name

        try:
            doc = await ingest_policy_document(
                session=db,
                title=title,
                filename=filename,
                content=content,
                doc_type="markdown",
            )
            loaded_count += 1
            loaded_docs.append(
                PolicyDocumentResponse(
                    id=doc.id,
                    title=doc.title,
                    source=doc.source,
                    doc_type=doc.doc_type,
                    file_size_bytes=doc.file_size_bytes,
                    checksum_sha256=doc.checksum_sha256,
                    status=doc.status,
                    chunk_count=0,
                    uploaded_at=doc.uploaded_at,
                    archived_at=doc.archived_at,
                )
            )
        except DuplicateDocumentError:
            skipped_count += 1
            continue

    all_active = await list_policy_documents(session=db, include_archived=False)
    return LoadSampleDocsResponse(
        loaded_count=loaded_count,
        skipped_count=skipped_count,
        documents=all_active,
    )
