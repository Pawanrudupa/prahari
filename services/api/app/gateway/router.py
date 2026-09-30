"""Gateway router exposing POST /v1/gateway/tool-call."""

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import append_audit_log, build_audit_payload
from app.auth.service import AuthError
from app.core import redis as redis_module
from app.core.database import get_db
from app.gateway.pipeline import execute_gateway_pipeline
from app.gateway.schemas import ToolCallRequest, ToolCallResponse

router = APIRouter(prefix="/v1/gateway", tags=["gateway"])


@router.post(
    "/tool-call",
    response_model=ToolCallResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate an agent tool call against governance policy",
)
async def gateway_tool_call(
    req: ToolCallRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ToolCallResponse:
    """
    Main gateway entrypoint for all agent tool calls.
    Returns allow, deny, redact, or escalate according to policy and hard limits.
    """
    try:
        return await execute_gateway_pipeline(
            session=db,
            redis=redis_module.redis_client,
            req=req,
        )
    except AuthError as e:
        # Audit authentication failure
        try:
            audit_payload = build_audit_payload(
                agent_id=e.agent_id if e.agent_id else uuid4(),
                tool=req.tool,
                args={},
                data_classes=[],
                outcome="deny",
                reason=f"auth_failed:{e.reason}",
                session_id=req.session_id,
                event_type="agent.auth_failed",
            )
            await append_audit_log(db, audit_payload)
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unauthorized: {e.reason}",
        ) from e
