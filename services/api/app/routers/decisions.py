"""Decisions and audit query endpoints with cursor pagination and filtering."""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.admin import require_session_or_admin_token
from app.core.database import get_db
from app.models.agent import Agent
from app.models.audit import AuditLog

router = APIRouter(prefix="/v1/decisions", tags=["decisions"])


class DecisionItem(BaseModel):
    id: UUID
    seq: int
    prev_hash: str
    hash: str
    action_id: str
    session_id: str
    agent_id: str
    agent_name: str
    tool: str
    outcome: str
    rule_id: str | None = None
    reason: str = ""
    risk_score: float = 0.0
    data_classes: list[str] = Field(default_factory=list)
    args_hash: str = ""
    timestamp: str
    created_at: datetime
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class DecisionsListResponse(BaseModel):
    items: list[DecisionItem]
    next_cursor: int | None = None
    has_more: bool = False
    total_count: int | None = None


class AdminEventItem(BaseModel):
    id: UUID
    seq: int
    prev_hash: str
    hash: str
    actor: str
    operation: str
    target: str
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: str
    created_at: datetime
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class AdminEventsListResponse(BaseModel):
    items: list[AdminEventItem]
    next_cursor: int | None = None
    has_more: bool = False
    total_count: int | None = None


@router.get(
    "",
    response_model=DecisionsListResponse,
    summary="List decision audit records with cursor pagination and filters",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_decisions(
    db: Annotated[AsyncSession, Depends(get_db)],
    cursor: Annotated[int | None, Query(description="Cursor seq (< cursor)")] = None,
    limit: Annotated[int, Query(ge=1, le=200, description="Page size limit")] = 50,
    outcome: Annotated[str | None, Query(description="Filter by outcome")] = None,
    agent: Annotated[str | None, Query(description="Filter by agent ID or name")] = None,
    tool: Annotated[str | None, Query(description="Filter by tool name")] = None,
    rule_id: Annotated[str | None, Query(description="Filter by rule ID")] = None,
    from_time: Annotated[datetime | None, Query(description="Filter created_at >=")] = None,
    to_time: Annotated[datetime | None, Query(description="Filter created_at <=")] = None,
) -> DecisionsListResponse:
    """
    Search and paginate decisions from the immutable, hash-chained audit log.
    Supports cursor pagination on sequence number (seq) and multi-dimensional filtering.
    """
    # 1. Build agent lookup cache for name resolution
    agents_res = await db.execute(select(Agent.id, Agent.name))
    agent_map = {str(row[0]): row[1] for row in agents_res.all()}

    # 2. Build base query
    stmt = select(AuditLog)
    if cursor is not None:
        stmt = stmt.where(AuditLog.seq < cursor)
    if from_time is not None:
        stmt = stmt.where(AuditLog.created_at >= from_time)
    if to_time is not None:
        stmt = stmt.where(AuditLog.created_at <= to_time)

    # Order strictly by seq descending for cursor pagination
    stmt = stmt.order_by(AuditLog.seq.desc())

    # We fetch an extra batch to perform in-memory filtering across dialects (SQLite/PostgreSQL)
    # while maintaining exact pagination semantics
    fetch_limit = limit * 4 if (outcome or agent or tool or rule_id) else limit + 1
    stmt = stmt.limit(fetch_limit)

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    filtered_items: list[DecisionItem] = []
    agent_filter_lower = agent.lower().strip() if agent else None
    outcome_filter_lower = outcome.lower().strip() if outcome else None
    tool_filter_lower = tool.lower().strip() if tool else None
    rule_filter_lower = rule_id.lower().strip() if rule_id else None

    for row in rows:
        payload = row.payload_json or {}

        # Only process governance tool decision events (allow, redact, escalate, deny)
        # Invariant: admin events must NOT appear as decisions attributed to agents
        item_outcome = str(payload.get("outcome", "")).lower()
        if (
            item_outcome not in ("allow", "redact", "escalate", "deny")
            or payload.get("rule_id") == "admin_action"
            or payload.get("event_category") == "admin"
        ):
            continue

        item_agent_id = str(payload.get("agent_id", ""))
        item_agent_name = agent_map.get(item_agent_id, item_agent_id)
        item_tool = str(payload.get("tool", ""))
        item_rule = str(payload.get("rule_id", ""))

        # Apply filters
        if outcome_filter_lower and item_outcome != outcome_filter_lower:
            continue
        if agent_filter_lower and (
            agent_filter_lower != item_agent_id.lower()
            and agent_filter_lower not in item_agent_name.lower()
        ):
            continue
        if tool_filter_lower and tool_filter_lower not in item_tool.lower():
            continue
        if rule_filter_lower and rule_filter_lower not in item_rule.lower():
            continue

        item = DecisionItem(
            id=row.id,
            seq=row.seq,
            prev_hash=row.prev_hash,
            hash=row.hash,
            action_id=str(payload.get("action_id", row.id)),
            session_id=str(payload.get("session_id", "")),
            agent_id=item_agent_id,
            agent_name=item_agent_name,
            tool=item_tool,
            outcome=item_outcome,
            rule_id=payload.get("rule_id"),
            reason=str(payload.get("reason", "")),
            risk_score=float(payload.get("risk_score", 0.0) or 0.0),
            data_classes=list(payload.get("data_classes") or []),
            args_hash=str(payload.get("args_hash", "")),
            timestamp=str(payload.get("timestamp") or row.created_at.isoformat()),
            created_at=row.created_at,
            raw_payload=payload,
        )
        filtered_items.append(item)
        if len(filtered_items) == limit:
            break

    has_more = len(filtered_items) == limit and len(rows) > limit
    next_cursor = filtered_items[-1].seq if (has_more and filtered_items) else None

    return DecisionsListResponse(
        items=filtered_items,
        next_cursor=next_cursor,
        has_more=has_more,
        total_count=len(filtered_items),
    )


@router.get(
    "/admin-events",
    response_model=AdminEventsListResponse,
    summary="List administrative audit events (default excluded from decision log)",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_admin_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    cursor: Annotated[int | None, Query(description="Cursor seq (< cursor)")] = None,
    limit: Annotated[int, Query(ge=1, le=200, description="Page size limit")] = 50,
    actor: Annotated[str | None, Query(description="Filter by actor")] = None,
    operation: Annotated[str | None, Query(description="Filter by operation")] = None,
) -> AdminEventsListResponse:
    """
    Search and paginate administrative state-change audit events.
    Displays actor, operation, target, safe details, and sequence verification.
    """
    stmt = select(AuditLog)
    if cursor is not None:
        stmt = stmt.where(AuditLog.seq < cursor)

    stmt = stmt.order_by(AuditLog.seq.desc()).limit(limit * 3)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    items: list[AdminEventItem] = []
    actor_lower = actor.lower().strip() if actor else None
    op_lower = operation.lower().strip() if operation else None

    for row in rows:
        payload = row.payload_json or {}
        is_admin = (
            payload.get("event_category") == "admin"
            or payload.get("rule_id") == "admin_action"
            or payload.get("outcome") == "admin_action"
            or str(payload.get("event_type", "")).startswith(
                ("agent.", "tool.", "policy.", "stress.", "approval.decided")
            )
        )
        if not is_admin:
            continue

        item_actor = str(payload.get("actor") or "admin")
        item_op = str(payload.get("operation") or payload.get("event_type") or "admin_action")
        item_target = str(payload.get("target") or payload.get("tool") or "system")

        if actor_lower and actor_lower not in item_actor.lower():
            continue
        if op_lower and op_lower not in item_op.lower():
            continue

        items.append(
            AdminEventItem(
                id=row.id,
                seq=row.seq,
                prev_hash=row.prev_hash,
                hash=row.hash,
                actor=item_actor,
                operation=item_op,
                target=item_target,
                details=dict(payload.get("details") or {}),
                timestamp=str(payload.get("timestamp") or row.created_at.isoformat()),
                created_at=row.created_at,
                raw_payload=payload,
            )
        )
        if len(items) == limit:
            break

    has_more = len(items) == limit and len(rows) > limit
    next_cursor = items[-1].seq if (has_more and items) else None

    return AdminEventsListResponse(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        total_count=len(items),
    )
