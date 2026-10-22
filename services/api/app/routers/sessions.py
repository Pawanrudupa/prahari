"""Session Workflow DAG Router.

Endpoints for exploring multi-step agent execution sessions, parent-child action DAGs,
and step-by-step timeline graph traversal.
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.admin import require_session_or_admin_token
from app.core.database import get_db
from app.models.agent import Agent
from app.models.decision import Decision
from app.models.session import Action, Session
from app.models.tool import Tool

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


class SessionListItem(BaseModel):
    id: UUID
    agent_id: UUID
    agent_name: str
    goal: str | None
    actions_count: int
    started_at: datetime
    ended_at: datetime | None


class DagNode(BaseModel):
    id: str
    type: str = Field(..., description="'goal', 'step', or 'tool_call'")
    seq: int
    label: str
    tool_name: str | None = None
    purpose: str | None = None
    outcome: str | None = None
    rule_id: str | None = None
    reason: str | None = None
    risk_score: float | None = None
    latency_ms: int | None = None
    timestamp: datetime
    action_id: UUID | None = None


class DagEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None
    outcome: str | None = None


class SessionDagGraphResponse(BaseModel):
    session_id: UUID
    agent_id: UUID
    agent_name: str
    goal: str | None
    started_at: datetime
    ended_at: datetime | None
    nodes: list[DagNode]
    edges: list[DagEdge]


@router.get(
    "",
    response_model=list[SessionListItem],
    summary="List agent execution sessions with action count and status",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    agent_id: Annotated[UUID | None, Query(description="Filter by agent ID")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[SessionListItem]:
    stmt = (
        select(
            Session,
            Agent.name.label("agent_name"),
            func.count(Action.id).label("actions_count"),
        )
        .join(Agent, Agent.id == Session.agent_id)
        .outerjoin(Action, Action.session_id == Session.id)
        .group_by(Session.id, Agent.name)
        .order_by(Session.started_at.desc())
        .limit(limit)
    )

    if agent_id:
        stmt = stmt.where(Session.agent_id == agent_id)

    rows = (await db.execute(stmt)).all()

    return [
        SessionListItem(
            id=s.id,
            agent_id=s.agent_id,
            agent_name=agent_name,
            goal=s.goal,
            actions_count=int(act_count),
            started_at=s.started_at,
            ended_at=s.ended_at,
        )
        for s, agent_name, act_count in rows
    ]


@router.get(
    "/{session_id}/graph",
    response_model=SessionDagGraphResponse,
    summary="Get hierarchical 3D/2D workflow DAG nodes and edges for a session",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def get_session_graph(
    session_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionDagGraphResponse:
    # 1. Fetch Session
    session_obj = await db.get(Session, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    agent = await db.get(Agent, session_obj.agent_id)
    agent_name = agent.name if agent else "Unknown Agent"

    # 2. Fetch Actions with Tools and Decisions
    actions_stmt = (
        select(
            Action,
            Tool.name.label("tool_name"),
            Decision.outcome,
            Decision.rule_id,
            Decision.reason,
            Decision.risk_score,
            Decision.latency_ms,
        )
        .join(Tool, Tool.id == Action.tool_id)
        .outerjoin(Decision, Decision.action_id == Action.id)
        .where(Action.session_id == session_id)
        .order_by(Action.seq.asc())
    )
    action_rows = (await db.execute(actions_stmt)).all()

    nodes: list[DagNode] = []
    edges: list[DagEdge] = []

    # Root Goal Node
    root_id = f"goal-{session_id}"
    nodes.append(
        DagNode(
            id=root_id,
            type="goal",
            seq=0,
            label=session_obj.goal or f"{agent_name} Task Goal",
            purpose=session_obj.goal,
            outcome="allow",
            timestamp=session_obj.started_at,
        )
    )

    # Action Nodes
    action_ids = set()
    for act, tool_name, outcome, rule_id, reason, risk_score, latency_ms in action_rows:
        node_id = f"action-{act.id}"
        action_ids.add(str(act.id))
        nodes.append(
            DagNode(
                id=node_id,
                type="tool_call",
                seq=act.seq,
                label=tool_name,
                tool_name=tool_name,
                purpose=act.purpose,
                outcome=outcome or "allow",
                rule_id=rule_id,
                reason=reason,
                risk_score=risk_score,
                latency_ms=latency_ms,
                timestamp=act.created_at,
                action_id=act.id,
            )
        )

        # Edge from parent or from root goal
        if act.parent_action_id and str(act.parent_action_id) in action_ids:
            source_id = f"action-{act.parent_action_id}"
        else:
            source_id = root_id

        edges.append(
            DagEdge(
                id=f"edge-{source_id}-{node_id}",
                source=source_id,
                target=node_id,
                label=f"Step {act.seq}",
                outcome=outcome or "allow",
            )
        )

    return SessionDagGraphResponse(
        session_id=session_obj.id,
        agent_id=session_obj.agent_id,
        agent_name=agent_name,
        goal=session_obj.goal,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        nodes=nodes,
        edges=edges,
    )
