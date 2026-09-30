"""Verification service for the append-only cryptographic hash chain."""

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import GENESIS_PREV_HASH, canonical_json, compute_audit_hash
from app.models.audit import AuditLog


class AuditVerificationResult(BaseModel):
    """Result of verifying the integrity of the audit hash chain."""

    valid: bool
    total_records: int
    broken_seq: int | None = None
    error: str | None = None


async def verify_audit_chain(session: AsyncSession) -> AuditVerificationResult:
    """
    Traverse the entire audit chain from seq 1 to head.
    Recalculates every SHA-256 hash and validates unbroken sequence links.
    Returns valid=True or points directly to the first broken_seq.
    """
    stmt = select(AuditLog).order_by(AuditLog.seq.asc())
    result = await session.execute(stmt)
    records = list(result.scalars().all())

    total = len(records)
    if total == 0:
        return AuditVerificationResult(valid=True, total_records=0)

    for i, record in enumerate(records):
        expected_seq = i + 1

        # 1. Check sequence number continuity
        if record.seq != expected_seq:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                broken_seq=expected_seq,
                error=f"Sequence discontinuity: expected seq {expected_seq}, found {record.seq}",
            )

        # 2. Check genesis or prev_hash linkage
        if i == 0:
            if record.prev_hash != GENESIS_PREV_HASH:
                return AuditVerificationResult(
                    valid=False,
                    total_records=total,
                    broken_seq=1,
                    error="Genesis record prev_hash mismatch",
                )
        else:
            prev_record = records[i - 1]
            if record.prev_hash != prev_record.hash:
                return AuditVerificationResult(
                    valid=False,
                    total_records=total,
                    broken_seq=record.seq,
                    error=(
                        f"Broken hash chain link at seq {record.seq}: "
                        "prev_hash does not match preceding record hash"
                    ),
                )

        # 3. Recalculate hash from payload and prev_hash
        payload_canon = canonical_json(record.payload_json)
        recalculated_hash = compute_audit_hash(record.prev_hash, payload_canon)
        if record.hash != recalculated_hash:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                broken_seq=record.seq,
                error=f"Payload tampered or hash mismatch at seq {record.seq}",
            )

    return AuditVerificationResult(valid=True, total_records=total)
