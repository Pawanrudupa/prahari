"""Tool registration and capability grant management endpoints."""

from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_admin_audit_event
from app.auth.admin import require_admin_token, require_session_or_admin_token
from app.core.database import get_db
from app.models.agent import Agent, AgentToolGrant
from app.models.tool import Tool

router = APIRouter(tags=["tools"])


class ToolCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=255, description="Unique tool name")
    server: str = Field(..., min_length=1, max_length=255, description="MCP server or provider")
    tool_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    sensitivity: str | None = Field(default="normal", max_length=50)
    tags: list[str] = Field(default_factory=list)


class ToolResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    server: str
    tool_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    sensitivity: str | None
    status: str = "active"
    tags: list[str] = Field(default_factory=list)


class ToolGrantRequest(BaseModel):
    tool_id: UUID = Field(..., description="ID of the tool to grant")


@router.post(
    "/v1/tools",
    response_model=ToolResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new tool (Admin only)",
    dependencies=[Depends(require_admin_token)],
)
async def create_tool(
    req: ToolCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ToolResponse:
    # Check if tool name already exists
    existing = await db.execute(select(Tool).where(Tool.name == req.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tool '{req.name}' is already registered",
        )

    tool = Tool(
        id=uuid4(),
        name=req.name,
        server=req.server,
        schema_json=req.tool_schema,
        sensitivity=req.sensitivity,
        status="active",
        tags=req.tags,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)

    await record_admin_audit_event(
        session=db,
        event_type="tool.created",
        details={
            "tool_id": str(tool.id),
            "name": tool.name,
            "server": tool.server,
            "sensitivity": tool.sensitivity,
            "tags": tool.tags,
        },
        tool=tool.name,
    )

    return ToolResponse(
        id=tool.id,
        name=tool.name,
        server=tool.server,
        schema_json=tool.schema_json,
        sensitivity=tool.sensitivity,
        status=tool.status,
        tags=tool.tags or [],
    )


@router.get(
    "/v1/tools",
    response_model=list[ToolResponse],
    summary="List all registered tools",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_tools(
    db: Annotated[AsyncSession, Depends(get_db)],
    include_stress: Annotated[bool, Query(description="Include stress-test tools")] = False,
    include_archived: Annotated[bool, Query(description="Include archived tools")] = False,
) -> list[ToolResponse]:
    stmt = select(Tool)
    if not include_archived:
        stmt = stmt.where(Tool.status != "archived")
    if not include_stress:
        stmt = stmt.where(
            not_(
                or_(
                    Tool.name.startswith("stress."),
                    cast(Tool.tags, String).contains("stress"),
                )
            )
        )
    stmt = stmt.order_by(Tool.name.asc())
    result = await db.execute(stmt)
    tools = list(result.scalars().all())
    return [
        ToolResponse(
            id=t.id,
            name=t.name,
            server=t.server,
            schema_json=t.schema_json,
            sensitivity=t.sensitivity,
            status=t.status,
            tags=t.tags or [],
        )
        for t in tools
    ]


@router.post(
    "/v1/agents/{agent_id}/grants",
    status_code=status.HTTP_201_CREATED,
    summary="Grant an agent permission to call a specific tool (Admin only)",
    dependencies=[Depends(require_admin_token)],
)
async def grant_tool_to_agent(
    agent_id: UUID,
    req: ToolGrantRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    # Check agent exists
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    # Check tool exists
    tool = await db.get(Tool, req.tool_id)
    if tool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    # Insert grant if not already granted
    existing = await db.get(AgentToolGrant, (agent_id, req.tool_id))
    if existing is None:
        grant = AgentToolGrant(agent_id=agent_id, tool_id=req.tool_id)
        db.add(grant)
        await db.commit()

        await record_admin_audit_event(
            session=db,
            event_type="agent.grant_added",
            details={
                "agent_id": str(agent_id),
                "tool_id": str(req.tool_id),
                "agent_name": agent.name,
                "tool_name": tool.name,
            },
            agent_id=agent_id,
            tool=tool.name,
        )

    return {"status": "granted", "agent_id": str(agent_id), "tool_id": str(req.tool_id)}


@router.delete(
    "/v1/agents/{agent_id}/grants/{tool_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke an agent's grant to a specific tool (Admin only)",
    dependencies=[Depends(require_admin_token)],
)
async def revoke_tool_from_agent(
    agent_id: UUID,
    tool_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    tool = await db.get(Tool, tool_id)
    if tool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    existing = await db.get(AgentToolGrant, (agent_id, tool_id))
    if existing is not None:
        await db.delete(existing)
        await db.commit()

        await record_admin_audit_event(
            session=db,
            event_type="agent.grant_revoked",
            details={
                "agent_id": str(agent_id),
                "tool_id": str(tool_id),
                "agent_name": agent.name,
                "tool_name": tool.name,
            },
            agent_id=agent_id,
            tool=tool.name,
        )

    return {"status": "revoked", "agent_id": str(agent_id), "tool_id": str(tool_id)}


@router.get(
    "/v1/agents/{agent_id}/grants",
    response_model=list[ToolResponse],
    summary="List all tools granted to an agent",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_agent_grants(
    agent_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ToolResponse]:
    stmt = (
        select(Tool)
        .join(AgentToolGrant, AgentToolGrant.tool_id == Tool.id)
        .where(AgentToolGrant.agent_id == agent_id)
        .order_by(Tool.name.asc())
    )
    result = await db.execute(stmt)
    tools = list(result.scalars().all())
    return [
        ToolResponse(
            id=t.id,
            name=t.name,
            server=t.server,
            schema_json=t.schema_json,
            sensitivity=t.sensitivity,
        )
        for t in tools
    ]
