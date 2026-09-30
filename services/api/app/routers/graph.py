"""Constellation graph snapshot endpoint for frontend initial state and
subscribe-then-snapshot ordering.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
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


class ToolNode(BaseModel):
    id: UUID
    name: str
    server: str
    sensitivity: str | None


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
) -> GraphSnapshotResponse:
    """
    Returns constellation topology and the latest audit sequence number.
    Implements subscribe-then-snapshot ordering: clients connect to /ws/events first,
    then fetch this snapshot and discard buffered events with audit_seq <= latest_audit_seq.
    """
    # 1. Fetch agents
    agent_rows = (await db.execute(select(Agent).order_by(Agent.name.asc()))).scalars().all()
    agents = [
        AgentNode(id=a.id, name=a.name, role=a.role, status=a.status)
        for a in agent_rows
    ]

    # 2. Fetch tools
    tool_rows = (await db.execute(select(Tool).order_by(Tool.name.asc()))).scalars().all()
    tools = [
        ToolNode(id=t.id, name=t.name, server=t.server, sensitivity=t.sensitivity)
        for t in tool_rows
    ]

    # 3. Fetch grants
    grant_rows = (await db.execute(select(AgentToolGrant))).scalars().all()
    grants = [
        GrantEdge(agent_id=g.agent_id, tool_id=g.tool_id)
        for g in grant_rows
    ]

    # 4. Fetch recent decisions and latest audit seq
    recent_audit_rows = (
        (await db.execute(select(AuditLog).order_by(AuditLog.seq.desc()).limit(50)))
        .scalars()
        .all()
    )

    latest_audit_seq = recent_audit_rows[0].seq if recent_audit_rows else 0

    recent_decisions = [
        RecentDecisionSummary(
            audit_seq=row.seq,
            action_id=str(row.payload_json.get("action_id", "")),
            agent_id=str(row.payload_json.get("agent_id", "")),
            tool=str(row.payload_json.get("tool", "")),
            outcome=str(row.payload_json.get("outcome", "")),
            rule_id=row.payload_json.get("rule_id"),
            reason=str(row.payload_json.get("reason", "")),
            timestamp=str(row.payload_json.get("timestamp", "")),
        )
        for row in recent_audit_rows
    ]

    return GraphSnapshotResponse(
        latest_audit_seq=latest_audit_seq,
        agents=agents,
        tools=tools,
        grants=grants,
        recent_decisions=recent_decisions,
    )
