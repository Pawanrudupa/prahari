"""Constellation graph snapshot endpoint for frontend initial state and
subscribe-then-snapshot ordering.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.admin import require_session_or_admin_token
from app.core.database import get_db
from app.models.agent import Agent, AgentToolGrant
from app.models.audit import AuditLog
from app.models.tool import Tool

router = APIRouter(prefix="/v1/graph", tags=["graph"])


class AgentNode(BaseModel):
    id: UUID
    name: str
    role: str | None
    status: str
    tags: list[str] = Field(default_factory=list)


class ToolNode(BaseModel):
    id: UUID
    name: str
    server: str
    sensitivity: str | None
    status: str = "active"
    tags: list[str] = Field(default_factory=list)


class GrantEdge(BaseModel):
    agent_id: UUID
    tool_id: UUID


class RecentDecisionSummary(BaseModel):
    audit_seq: int
    action_id: str
    agent_id: str
    tool: str
    outcome: str
    rule_id: str | None
    reason: str
    timestamp: str


class GraphSnapshotResponse(BaseModel):
    """Full snapshot of the constellation topology and recent decisions."""

    latest_audit_seq: int
    agents: list[AgentNode]
    tools: list[ToolNode]
    grants: list[GrantEdge]
    recent_decisions: list[RecentDecisionSummary]


@router.get(
    "/snapshot",
    response_model=GraphSnapshotResponse,
    summary="Get initial constellation topology snapshot (Agents, Tools, Grants, Recent Decisions)",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def get_graph_snapshot(
    db: Annotated[AsyncSession, Depends(get_db)],
    include_stress: Annotated[bool, Query(description="Include stress-test nodes")] = False,
    include_archived: Annotated[bool, Query(description="Include archived nodes")] = False,
) -> GraphSnapshotResponse:
    """
    Returns constellation topology and the latest audit sequence number.
    Implements subscribe-then-snapshot ordering: clients connect to /ws/events first,
    then fetch this snapshot and discard buffered events with audit_seq <= latest_audit_seq.
    Stress and archived nodes are excluded by default for clean demo visualization.
    """
    # 1. Fetch agents
    agent_stmt = select(Agent)
    if not include_archived:
        agent_stmt = agent_stmt.where(Agent.status != "archived")
    if not include_stress:
        agent_stmt = agent_stmt.where(
            not_(
                or_(
                    Agent.name.startswith("Stress-"),
                    cast(Agent.tags, String).contains("stress"),
                )
            )
        )
    agent_stmt = agent_stmt.order_by(Agent.name.asc())
    agent_rows = (await db.execute(agent_stmt)).scalars().all()
    agents = [
        AgentNode(
            id=a.id,
            name=a.name,
            role=a.role,
            status=a.status,
            tags=a.tags or [],
        )
        for a in agent_rows
    ]
    agent_id_set = {a.id for a in agents}

    # 2. Fetch tools
    tool_stmt = select(Tool)
    if not include_archived:
        tool_stmt = tool_stmt.where(Tool.status != "archived")
    if not include_stress:
        tool_stmt = tool_stmt.where(
            not_(
                or_(
                    Tool.name.startswith("stress."),
                    cast(Tool.tags, String).contains("stress"),
                )
            )
        )
    tool_stmt = tool_stmt.order_by(Tool.name.asc())
    tool_rows = (await db.execute(tool_stmt)).scalars().all()
    tools = [
        ToolNode(
            id=t.id,
            name=t.name,
            server=t.server,
            sensitivity=t.sensitivity,
            status=t.status,
            tags=t.tags or [],
        )
        for t in tool_rows
    ]
    tool_id_set = {t.id for t in tools}

    # 3. Fetch grants (only those linking visible agents and tools)
    grant_rows = (await db.execute(select(AgentToolGrant))).scalars().all()
    grants = [
        GrantEdge(agent_id=g.agent_id, tool_id=g.tool_id)
        for g in grant_rows
        if g.agent_id in agent_id_set and g.tool_id in tool_id_set
    ]

    # 4. Fetch recent decisions and latest audit seq
    audit_stmt = select(AuditLog).order_by(AuditLog.seq.desc()).limit(100)
    recent_audit_rows = (await db.execute(audit_stmt)).scalars().all()

    latest_audit_seq = recent_audit_rows[0].seq if recent_audit_rows else 0

    recent_decisions: list[RecentDecisionSummary] = []
    for row in recent_audit_rows:
        if not row.payload_json:
            continue
        row_agent_id_str = str(row.payload_json.get("agent_id", ""))
        # Filter decisions by visible agents if not include_stress
        if not include_stress and row_agent_id_str:
            try:
                row_agent_uuid = UUID(row_agent_id_str)
                if row_agent_uuid not in agent_id_set:
                    continue
            except ValueError:
                pass

        recent_decisions.append(
            RecentDecisionSummary(
                audit_seq=row.seq,
                action_id=str(row.payload_json.get("action_id", "")),
                agent_id=row_agent_id_str,
                tool=str(row.payload_json.get("tool", "")),
                outcome=str(row.payload_json.get("outcome", "")),
                rule_id=row.payload_json.get("rule_id"),
                reason=str(row.payload_json.get("reason", "")),
                timestamp=str(row.payload_json.get("timestamp", row.created_at.isoformat())),
            )
        )
        if len(recent_decisions) >= 50:
            break

    return GraphSnapshotResponse(
        latest_audit_seq=latest_audit_seq,
        agents=agents,
        tools=tools,
        grants=grants,
        recent_decisions=recent_decisions,
    )
