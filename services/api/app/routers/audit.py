"""Audit router providing GET /v1/audit/verify and POST /v1/audit/checkpoint."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import create_checkpoint
from app.audit.verifier import AuditVerificationResult, verify_audit_chain
from app.auth.admin import require_admin_token
from app.core.database import get_db

router = APIRouter(
    prefix="/v1/audit",
    tags=["audit"],
    dependencies=[Depends(require_admin_token)],
)


class AuditCheckpointResponse(BaseModel):
    """HMAC-signed audit log checkpoint response."""

    id: UUID
    seq: int
    head_hash: str
    signature: str
    created_at: datetime


@router.get(
    "/verify",
    response_model=AuditVerificationResult,
    summary="Verify cryptographic integrity of audit log and signed checkpoints",
)
async def verify_audit_log_endpoint(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuditVerificationResult:
    """
    Traverses the complete audit log, validates sequential sequence numbers,
    recalculates SHA-256 hash chains, verifies all HMAC-signed checkpoints,
    and detects any tampering, tail truncation, or whole-chain rewriting.
    """
    return await verify_audit_chain(db)


@router.post(
    "/checkpoint",
    response_model=AuditCheckpointResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an HMAC-signed cryptographic checkpoint of the current audit chain head",
)
async def create_checkpoint_endpoint(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuditCheckpointResponse:
    """
    Takes an HMAC-SHA256 signature of (seq, head_hash) and saves a checkpoint.
    Prevents database tail truncation and whole-chain rewriting attacks.
    """
    checkpoint = await create_checkpoint(db)
    if checkpoint is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot checkpoint empty audit log",
        )

    return AuditCheckpointResponse(
        id=checkpoint.id,
        seq=checkpoint.seq,
        head_hash=checkpoint.head_hash,
        signature=checkpoint.signature,
        created_at=checkpoint.created_at,
    )
