from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_admin_audit_event
from app.auth.admin import require_admin_token
from app.auth.service import generate_api_key
from app.core.database import get_db
from app.models.agent import Agent
from app.models.audit import AuditLog

router = APIRouter(
    prefix="/v1/agents",
    tags=["agents"],
    dependencies=[Depends(require_admin_token)],
)


class AgentCreateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    owner: str = Field(..., max_length=255)
    role: str | None = Field(default=None, max_length=50)


class AgentStatusUpdateRequest(BaseModel):
    status: Literal["active", "disabled"] = Field(..., description="Target agent status")


class AgentCreateResponse(BaseModel):
    id: UUID
    name: str
    owner: str
    role: str | None
    api_key: str = Field(..., description="Shown only once at creation time")
    status: str
    created_at: datetime


class AgentKeyRotateResponse(BaseModel):
    id: UUID
    name: str
    api_key: str = Field(..., description="Rotated API key shown only once")


class AgentResponse(BaseModel):
    id: UUID
    name: str
    owner: str
    role: str | None
    status: str
    created_at: datetime


class AgentActivityPoint(BaseModel):
    timestamp: str
    count: int
    allow: int = 0
    redact: int = 0
    escalate: int = 0
    deny: int = 0


class AgentActivityResponse(BaseModel):
    agent_id: UUID
    window: str
    points: list[AgentActivityPoint]


@router.post(
    "",
    response_model=AgentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new agent and receive its single-use API key",
)
async def create_agent(
    req: AgentCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentCreateResponse:
    # Check if agent name already exists
    existing = await db.execute(select(Agent).where(Agent.name == req.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Agent '{req.name}' is already registered",
        )

    key_info = generate_api_key()
    agent = Agent(
        id=uuid4(),
        name=req.name,
        owner=req.owner,
        role=req.role,
        api_key_prefix=key_info.prefix,
        api_key_hash=key_info.hashed,
        status="active",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    # Append admin audit log
    await record_admin_audit_event(
        session=db,
        event_type="agent.created",
        details={
            "agent_id": str(agent.id),
            "name": agent.name,
            "role": agent.role,
            "owner": agent.owner,
            "key_prefix": key_info.prefix,
        },
        agent_id=agent.id,
    )

    return AgentCreateResponse(
        id=agent.id,
        name=agent.name,
        owner=agent.owner,
        role=agent.role,
        api_key=key_info.full_key,
        status=agent.status,
        created_at=agent.created_at,
    )


@router.get(
    "",
    response_model=list[AgentResponse],
    summary="List registered agents",
)
async def list_agents(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AgentResponse]:
    stmt = select(Agent).order_by(Agent.created_at.desc())
    result = await db.execute(stmt)
    agents = result.scalars().all()
    return [
        AgentResponse(
            id=a.id,
            name=a.name,
            owner=a.owner,
            role=a.role,
            status=a.status,
            created_at=a.created_at,
        )
        for a in agents
    ]


@router.patch(
    "/{agent_id}",
    response_model=AgentResponse,
    summary="Update agent status (enable/disable)",
)
async def update_agent_status(
    agent_id: UUID,
    req: AgentStatusUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentResponse:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )

    old_status = agent.status
    agent.status = req.status
    await db.commit()
    await db.refresh(agent)

    # Append admin audit log
    await record_admin_audit_event(
        session=db,
        event_type="agent.status_updated",
        details={
            "agent_id": str(agent.id),
            "name": agent.name,
            "old_status": old_status,
            "new_status": agent.status,
        },
        agent_id=agent.id,
    )

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        owner=agent.owner,
        role=agent.role,
        status=agent.status,
        created_at=agent.created_at,
    )


@router.post(
    "/{agent_id}/rotate-key",
    response_model=AgentKeyRotateResponse,
    summary="Rotate API key for an agent (Admin only)",
)
async def rotate_agent_key(
    agent_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentKeyRotateResponse:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )
    key_info = generate_api_key()
    agent.api_key_prefix = key_info.prefix
    agent.api_key_hash = key_info.hashed
    await db.commit()
    await db.refresh(agent)

    # Append admin audit log
    await record_admin_audit_event(
        session=db,
        event_type="agent.key_rotated",
        details={
            "agent_id": str(agent.id),
            "name": agent.name,
            "key_prefix": key_info.prefix,
        },
        agent_id=agent.id,
    )

    return AgentKeyRotateResponse(
        id=agent.id,
        name=agent.name,
        api_key=key_info.full_key,
    )


@router.get(
    "/{agent_id}/activity",
    response_model=AgentActivityResponse,
    summary="Get per-agent activity sparkline timeseries data",
)
async def get_agent_activity(
    agent_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    window: str = Query(default="24h", pattern="^(1h|24h|7d)$"),
) -> AgentActivityResponse:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )

    now = datetime.now(UTC)
    if window == "1h":
        delta = timedelta(hours=1)
        num_buckets = 12
    elif window == "7d":
        delta = timedelta(days=7)
        num_buckets = 14
    else:
        delta = timedelta(hours=24)
        num_buckets = 24

    start_time = now - delta
    bucket_duration = delta / num_buckets

    stmt = (
        select(AuditLog)
        .where(AuditLog.created_at >= start_time)
        .order_by(AuditLog.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    buckets: list[dict[str, Any]] = []
    for i in range(num_buckets):
        b_time = start_time + (i * bucket_duration)
        buckets.append({
            "timestamp": b_time.isoformat(),
            "count": 0,
            "allow": 0,
            "redact": 0,
            "escalate": 0,
            "deny": 0,
        })

    agent_id_str = str(agent_id)
    for row in rows:
        payload = row.payload_json or {}
        if str(payload.get("agent_id")) != agent_id_str:
            continue

        outcome = str(payload.get("outcome", "")).lower()
        # Only count agent tool-call decision events in activity sparkline
        is_decided = payload.get("event_type") == "action.decided"
        is_outcome = outcome in ("allow", "redact", "escalate", "deny")
        if not (is_decided or is_outcome):
            continue
        if payload.get("rule_id") == "admin_action":
            continue

        row_time = row.created_at
        if row_time.tzinfo is None:
            row_time = row_time.replace(tzinfo=UTC)

        idx = int((row_time - start_time) / bucket_duration)
        if 0 <= idx < num_buckets:
            buckets[idx]["count"] += 1
            if outcome in ("allow", "redact", "escalate", "deny"):
                buckets[idx][outcome] += 1

    return AgentActivityResponse(
        agent_id=agent_id,
        window=window,
        points=[AgentActivityPoint(**b) for b in buckets],
    )

