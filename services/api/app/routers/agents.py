"""Agent registration and management router."""

from datetime import datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.admin import require_admin_token
from app.auth.service import generate_api_key
from app.core.database import get_db
from app.models.agent import Agent

router = APIRouter(
    prefix="/v1/agents",
    tags=["agents"],
    dependencies=[Depends(require_admin_token)],
)


class AgentCreateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    owner: str = Field(..., max_length=255)
    role: str | None = Field(default=None, max_length=50)


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

    return AgentKeyRotateResponse(
        id=agent.id,
        name=agent.name,
        api_key=key_info.full_key,
    )
