"""Tool registration and capability grant management endpoints."""

from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


class ToolResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    server: str
    tool_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    sensitivity: str | None


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
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)

    return ToolResponse(
        id=tool.id,
        name=tool.name,
        server=tool.server,
        schema_json=tool.schema_json,
        sensitivity=tool.sensitivity,
    )


@router.get(
    "/v1/tools",
    response_model=list[ToolResponse],
    summary="List all registered tools",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_tools(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ToolResponse]:
    result = await db.execute(select(Tool).order_by(Tool.name.asc()))
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

    return {"status": "granted", "agent_id": str(agent_id), "tool_id": str(req.tool_id)}


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
