import hmac

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import (
    GENESIS_PREV_HASH,
    canonical_json,
    compute_audit_hash,
    sign_checkpoint,
)
from app.models.audit import AuditCheckpoint, AuditLog


class AuditVerificationResult(BaseModel):
    """Result of verifying the integrity of the audit hash chain and signed checkpoints."""

    valid: bool
    total_records: int
    checkpoints_verified: int = 0
    broken_seq: int | None = None
    error: str | None = None


async def verify_audit_chain(session: AsyncSession) -> AuditVerificationResult:
    """
    Traverse the entire audit chain from seq 1 to head and verify HMAC-signed checkpoints.

    1. Checks continuity of sequence numbers.
    2. Recalculates every SHA-256 hash against its canonical payload and prev_hash.
    3. Validates HMAC signatures of all stored audit checkpoints.
    4. Detects tail truncation (records deleted after a checkpoint).
    5. Detects whole-chain rewriting (recomputed hashes differing from signed checkpoints).
    """
    # 1. Fetch all audit log records
    stmt = select(AuditLog).order_by(AuditLog.seq.asc())
    result = await session.execute(stmt)
    records = list(result.scalars().all())

    total = len(records)

    # 2. Fetch all checkpoints
    cp_stmt = select(AuditCheckpoint).order_by(AuditCheckpoint.seq.asc())
    cp_result = await session.execute(cp_stmt)
    checkpoints = list(cp_result.scalars().all())

    # Check for empty chain with existing checkpoints (extreme truncation)
    if total == 0:
        if checkpoints:
            first_cp = checkpoints[0]
            return AuditVerificationResult(
                valid=False,
                total_records=0,
                checkpoints_verified=0,
                broken_seq=first_cp.seq,
                error=(
                    f"Tail truncation detected: checkpoints exist up to seq "
                    f"{checkpoints[-1].seq} but log is empty"
                ),
            )
        return AuditVerificationResult(valid=True, total_records=0, checkpoints_verified=0)

    # 3. Verify internal hash-chain continuity & recalculate SHA-256 hashes
    for i, record in enumerate(records):
        expected_seq = i + 1

        # Check sequence number continuity
        if record.seq != expected_seq:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=expected_seq,
                error=f"Sequence discontinuity: expected seq {expected_seq}, found {record.seq}",
            )

        # Check genesis or prev_hash linkage
        if i == 0:
            if record.prev_hash != GENESIS_PREV_HASH:
                return AuditVerificationResult(
                    valid=False,
                    total_records=total,
                    checkpoints_verified=0,
                    broken_seq=1,
                    error="Genesis record prev_hash mismatch",
                )
        else:
            prev_record = records[i - 1]
            if record.prev_hash != prev_record.hash:
                return AuditVerificationResult(
                    valid=False,
                    total_records=total,
                    checkpoints_verified=0,
                    broken_seq=record.seq,
                    error=(
                        f"Broken hash chain link at seq {record.seq}: "
                        "prev_hash does not match preceding record hash"
                    ),
                )

        # Recalculate hash from canonical payload and prev_hash
        payload_canon = canonical_json(record.payload_json)
        recalculated_hash = compute_audit_hash(record.prev_hash, payload_canon)
        if record.hash != recalculated_hash:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=record.seq,
                error=f"Payload tampered or hash mismatch at seq {record.seq}",
            )

    # 4. Verify HMAC-signed checkpoints against chain state
    from app.core.config import settings

    # Detect if checkpoints table was completely wiped on a long chain
    chk_int = settings.AUDIT_CHECKPOINT_INTERVAL
    if chk_int > 0 and total >= chk_int and len(checkpoints) == 0:
        return AuditVerificationResult(
            valid=False,
            total_records=total,
            checkpoints_verified=0,
            broken_seq=chk_int,
            error=(
                "Missing checkpoints detected: audit chain records exceed "
                "checkpoint interval but no checkpoints exist"
            ),
        )

    prev_cp_seq = 0
    for cp in checkpoints:
        # 4a. Checkpoint sequence monotonicity
        if cp.seq <= prev_cp_seq:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=cp.seq,
                error=f"Checkpoint sequence non-monotonic or corrupted at seq {cp.seq}",
            )
        prev_cp_seq = cp.seq

        # 4b. Checkpoint cryptographic signature verification
        expected_sig = sign_checkpoint(cp.seq, cp.head_hash)
        if not hmac.compare_digest(cp.signature, expected_sig):
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=cp.seq,
                error=f"Audit checkpoint signature invalid or tampered at seq {cp.seq}",
            )

        # 4c. Anti-tail-truncation: chain must contain at least the checkpointed seq
        if total < cp.seq:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=cp.seq,
                error=(
                    f"Tail truncation detected: checkpoint exists at seq {cp.seq} "
                    f"but chain only contains {total} records"
                ),
            )

        # 4d. Anti-chain-rewriting: record at cp.seq must match checkpoint's signed head_hash
        chain_rec = records[cp.seq - 1]
        if chain_rec.hash != cp.head_hash:
            return AuditVerificationResult(
                valid=False,
                total_records=total,
                checkpoints_verified=0,
                broken_seq=cp.seq,
                error=(
                    f"Chain rewriting detected: record hash at seq {cp.seq} "
                    f"does not match HMAC-signed checkpoint"
                ),
            )

    return AuditVerificationResult(
        valid=True, total_records=total, checkpoints_verified=len(checkpoints)
    )


