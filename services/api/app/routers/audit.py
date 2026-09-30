"""Audit router providing GET /v1/audit/verify."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.verifier import AuditVerificationResult, verify_audit_chain
from app.core.database import get_db

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get(
    "/verify",
    response_model=AuditVerificationResult,
    summary="Verify the cryptographic integrity of the hash-chained audit log",
)
async def verify_audit_log_endpoint(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuditVerificationResult:
    """
    Traverses the complete audit log, validates sequential sequence numbers,
    recalculates SHA-256 hash chains, and reports whether the log is intact
    or pinpoints the first tampered sequence number.
    """
    return await verify_audit_chain(db)
