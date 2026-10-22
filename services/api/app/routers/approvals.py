"""Human Approvals Queue Router.

Endpoints for listing, inspecting, deciding approvals, and agent polling.
Roles: approver and admin only.
"""

import contextlib
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_admin_audit_event
from app.auth.admin import require_approver_or_admin, require_session_or_admin_token
from app.core.database import get_db
from app.core.redis import redis_client
from app.events.bus import publish_event
from app.models.agent import Agent
from app.models.decision import Approval
from app.models.tool import Tool

router = APIRouter(prefix="/v1/approvals", tags=["approvals"])
gateway_approvals_router = APIRouter(prefix="/v1/gateway/approvals", tags=["gateway-approvals"])


class ApprovalListItem(BaseModel):
    id: UUID
    decision_id: UUID
    agent_id: UUID | None
    agent_name: str
    tool_id: UUID | None
    tool_name: str
    status: str
    args_hash: str | None
    risk_score: float | None
    rule_id: str | None
    reason: str | None
    approver: str | None
    decided_at: datetime | None
    note: str | None
    token_consumed: bool
    created_at: datetime


class ApprovalDetailResponse(ApprovalListItem):
    token_expires_at: datetime | None = None


class ApprovalDecideRequest(BaseModel):
    decision: Literal["approve", "deny"] = Field(..., description="Approval decision")
    note: str | None = Field(default=None, max_length=1000, description="Optional decision note")


class ApprovalDecideResponse(BaseModel):
    id: UUID
    status: str
    approval_token: str | None = None
    expires_at: datetime | None = None
    note: str | None = None


class GatewayApprovalPollResponse(BaseModel):
    id: UUID
    status: str
    approval_token: str | None = None
    expires_at: datetime | None = None


def _is_expired(expires_at: datetime | None, now: datetime) -> bool:
    if not expires_at:
        return False
    target = expires_at.replace(tzinfo=UTC) if expires_at.tzinfo is None else expires_at
    return target < now


@router.get(
    "",
    response_model=list[ApprovalListItem],
    summary="List approvals with optional status filter",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_approvals(
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[
        str,
        Query(
            alias="status",
            description="Filter by status: pending, approved, denied, expired, all",
        ),
    ] = "pending",
) -> list[ApprovalListItem]:
    stmt = (
        select(
            Approval,
            Agent.name.label("agent_name"),
            Tool.name.label("tool_name"),
        )
        .outerjoin(Agent, Agent.id == Approval.agent_id)
        .outerjoin(Tool, Tool.id == Approval.tool_id)
    )

    now = datetime.now(UTC)

    if status_filter != "all":
        if status_filter == "pending":
            stmt = stmt.where(Approval.status == "pending")
        elif status_filter == "approved":
            stmt = stmt.where(Approval.status == "approved")
        elif status_filter == "denied":
            stmt = stmt.where(Approval.status == "denied")
        elif status_filter == "expired":
            stmt = stmt.where(
                (Approval.status == "expired")
                | (
                    (Approval.status == "approved")
                    & (Approval.token_expires_at.is_not(None))
                    & (Approval.token_expires_at < now)
                )
            )

    stmt = stmt.order_by(Approval.created_at.desc())
    res = await db.execute(stmt)
    rows = res.all()

    items: list[ApprovalListItem] = []
    for app_obj, agent_name, tool_name in rows:
        # Check lazy expiry
        current_status = app_obj.status
        if (
            current_status == "approved"
            and _is_expired(app_obj.token_expires_at, now)
            and not app_obj.token_consumed
        ):
            current_status = "expired"

        items.append(
            ApprovalListItem(
                id=app_obj.id,
                decision_id=app_obj.decision_id,
                agent_id=app_obj.agent_id,
                agent_name=agent_name or "Unknown Agent",
                tool_id=app_obj.tool_id,
                tool_name=tool_name or "Unknown Tool",
                status=current_status,
                args_hash=app_obj.args_hash,
                risk_score=app_obj.risk_score,
                rule_id=app_obj.rule_id,
                reason=app_obj.reason,
                approver=app_obj.approver,
                decided_at=app_obj.decided_at,
                note=app_obj.note,
                token_consumed=app_obj.token_consumed,
                created_at=app_obj.created_at,
            )
        )
    return items


@router.get(
    "/{approval_id}",
    response_model=ApprovalDetailResponse,
    summary="Get single approval details",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def get_approval(
    approval_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApprovalDetailResponse:
    stmt = (
        select(
            Approval,
            Agent.name.label("agent_name"),
            Tool.name.label("tool_name"),
        )
        .outerjoin(Agent, Agent.id == Approval.agent_id)
        .outerjoin(Tool, Tool.id == Approval.tool_id)
        .where(Approval.id == approval_id)
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")

    app_obj, agent_name, tool_name = row
    current_status = app_obj.status
    now = datetime.now(UTC)
    if (
        current_status == "approved"
        and _is_expired(app_obj.token_expires_at, now)
        and not app_obj.token_consumed
    ):
        current_status = "expired"

    return ApprovalDetailResponse(
        id=app_obj.id,
        decision_id=app_obj.decision_id,
        agent_id=app_obj.agent_id,
        agent_name=agent_name or "Unknown Agent",
        tool_id=app_obj.tool_id,
        tool_name=tool_name or "Unknown Tool",
        status=current_status,
        args_hash=app_obj.args_hash,
        risk_score=app_obj.risk_score,
        rule_id=app_obj.rule_id,
        reason=app_obj.reason,
        approver=app_obj.approver,
        decided_at=app_obj.decided_at,
        note=app_obj.note,
        token_consumed=app_obj.token_consumed,
        token_expires_at=app_obj.token_expires_at,
        created_at=app_obj.created_at,
    )


@router.post(
    "/{approval_id}/decide",
    response_model=ApprovalDecideResponse,
    summary="Approve or deny a pending escalation (Approver/Admin only)",
)
async def decide_approval(
    approval_id: UUID,
    req: ApprovalDecideRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    identity: Annotated[dict[str, str], Depends(require_approver_or_admin)],
) -> ApprovalDecideResponse:
    app_obj = await db.get(Approval, approval_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Approval not found")

    if app_obj.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Approval has already been decided (current status: {app_obj.status})",
        )

    actor = identity.get("sub", "admin")
    now = datetime.now(UTC)

    if req.decision == "approve":
        token_raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token_raw.encode()).hexdigest()
        expires_at = now + timedelta(minutes=5)

        app_obj.status = "approved"
        app_obj.approver = actor
        app_obj.decided_at = now
        app_obj.note = req.note
        app_obj.token_hash = token_hash
        app_obj.token_expires_at = expires_at
        app_obj.token_consumed = False

        await db.commit()

        # Cache ephemeral token in Redis with 5 minute TTL for agent polling
        if redis_client is not None:
            with contextlib.suppress(Exception):
                await redis_client.set(
                    f"prahari:approval:token:{approval_id}",
                    token_raw,
                    ex=300,
                )

        # Record admin audit event
        await record_admin_audit_event(
            session=db,
            event_type="approval.decided",
            details={
                "approval_id": str(approval_id),
                "decision": "approved",
                "approver": actor,
                "expires_at": expires_at.isoformat(),
                "note": req.note,
            },
            agent_id=app_obj.agent_id,
        )

        # Broadcast WS event
        await publish_event(
            "approval.decided",
            {
                "approval_id": str(approval_id),
                "status": "approved",
                "approver": actor,
                "decided_at": now.isoformat(),
            },
        )

        return ApprovalDecideResponse(
            id=app_obj.id,
            status="approved",
            approval_token=token_raw,
            expires_at=expires_at,
            note=req.note,
        )
    else:
        app_obj.status = "denied"
        app_obj.approver = actor
        app_obj.decided_at = now
        app_obj.note = req.note

        await db.commit()

        # Record admin audit event
        await record_admin_audit_event(
            session=db,
            event_type="approval.decided",
            details={
                "approval_id": str(approval_id),
                "decision": "denied",
                "approver": actor,
                "note": req.note,
            },
            agent_id=app_obj.agent_id,
        )

        # Broadcast WS event
        await publish_event(
            "approval.decided",
            {
                "approval_id": str(approval_id),
                "status": "denied",
                "approver": actor,
                "decided_at": now.isoformat(),
            },
        )

        return ApprovalDecideResponse(
            id=app_obj.id,
            status="denied",
            note=req.note,
        )


@gateway_approvals_router.get(
    "/{approval_id}",
    response_model=GatewayApprovalPollResponse,
    summary="Agent polling endpoint for approval status and single-use token",
)
async def gateway_poll_approval(
    approval_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GatewayApprovalPollResponse:
    app_obj = await db.get(Approval, approval_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Approval not found")

    now = datetime.now(UTC)
    current_status = app_obj.status

    if (
        current_status == "approved"
        and _is_expired(app_obj.token_expires_at, now)
        and not app_obj.token_consumed
    ):
        current_status = "expired"
        app_obj.status = "expired"
        await db.commit()

    token_raw: str | None = None
    if current_status == "approved" and not app_obj.token_consumed and redis_client is not None:
        with contextlib.suppress(Exception):
            cached = await redis_client.get(f"prahari:approval:token:{approval_id}")
            if cached:
                token_raw = cached.decode() if isinstance(cached, bytes) else str(cached)

    return GatewayApprovalPollResponse(
        id=app_obj.id,
        status=current_status,
        approval_token=token_raw,
        expires_at=app_obj.token_expires_at,
    )
