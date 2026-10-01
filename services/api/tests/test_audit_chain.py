"""Tests for append-only hash-chained audit log and tamper verification."""

from uuid import uuid4

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import (
    GENESIS_PREV_HASH,
    append_audit_log,
    build_audit_payload,
)
from app.audit.verifier import verify_audit_chain
from app.models.audit import AuditLog

pytestmark = [pytest.mark.postgres]


@pytest.mark.asyncio
async def test_audit_chain_sequential_integrity(db_session: AsyncSession) -> None:
    """Verify that sequentially appended records form an unbroken cryptographic hash chain."""
    agent_id = uuid4()

    # Append 10 audit records
    for i in range(1, 11):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"test.tool_{i}",
            args={"param": i, "secret": f"raw_secret_{i}"},
            data_classes=["phone"] if i % 2 == 0 else [],
            outcome="allow" if i < 8 else "deny",
            reason=f"step_{i}",
        )
        entry = await append_audit_log(db_session, payload)
        assert entry.seq == i

    # Verify the complete chain
    verification = await verify_audit_chain(db_session)
    assert verification.valid is True
    assert verification.total_records == 10
    assert verification.broken_seq is None
    assert verification.error is None

    # Inspect records
    result = await db_session.execute(select(AuditLog).order_by(AuditLog.seq.asc()))
    records = list(result.scalars().all())
    assert len(records) == 10

    # Genesis check
    assert records[0].prev_hash == GENESIS_PREV_HASH

    # Consecutive links check
    for idx in range(1, 10):
        assert records[idx].prev_hash == records[idx - 1].hash


@pytest.mark.asyncio
async def test_audit_chain_tamper_edit_payload(db_session: AsyncSession) -> None:
    """Tamper test: Modifying payload content of an existing record must fail verification."""
    agent_id = uuid4()
    for i in range(1, 6):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"v": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    # Initial chain is valid
    assert (await verify_audit_chain(db_session)).valid is True

    # Tamper with row seq 3: change outcome from 'allow' to 'deny' without recomputing hash
    tampered_payload = build_audit_payload(
        agent_id=agent_id,
        tool="tool_3",
        args={"v": 3},
        data_classes=[],
        outcome="deny",  # modified
    )
    stmt = update(AuditLog).where(AuditLog.seq == 3).values(payload_json=tampered_payload)
    await db_session.execute(stmt)
    await db_session.commit()

    # Verification must catch the tampered row at exactly seq 3
    result = await verify_audit_chain(db_session)
    assert result.valid is False
    assert result.broken_seq == 3
    assert result.error is not None
    assert "Payload tampered or hash mismatch" in result.error


@pytest.mark.asyncio
async def test_audit_chain_tamper_delete_row(db_session: AsyncSession) -> None:
    """Tamper test: Deleting a row from the middle of the chain must fail verification."""
    agent_id = uuid4()
    for i in range(1, 7):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"i": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    # Delete row seq 4
    await db_session.execute(delete(AuditLog).where(AuditLog.seq == 4))
    await db_session.commit()

    # Verification must fail at sequence gap
    result = await verify_audit_chain(db_session)
    assert result.valid is False
    assert result.broken_seq == 4
    assert result.error is not None
    assert "Sequence discontinuity" in result.error


@pytest.mark.asyncio
async def test_audit_chain_tamper_reorder_rows(db_session: AsyncSession) -> None:
    """Tamper test: Swapping row payloads or sequence numbers must fail verification."""
    agent_id = uuid4()
    for i in range(1, 5):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"n": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    # Fetch rows 2 and 3 and swap their payload_json
    r2 = (await db_session.execute(select(AuditLog).where(AuditLog.seq == 2))).scalar_one()
    r3 = (await db_session.execute(select(AuditLog).where(AuditLog.seq == 3))).scalar_one()

    temp = r2.payload_json
    r2.payload_json = r3.payload_json
    r3.payload_json = temp
    await db_session.commit()

    # Verification must fail at seq 2
    result = await verify_audit_chain(db_session)
    assert result.valid is False
    assert result.broken_seq == 2


@pytest.mark.asyncio
async def test_audit_privacy_no_raw_args_or_secrets(db_session: AsyncSession) -> None:
    """Invariant 3: No raw PII or secrets stored in audit payloads; store args_hash only."""
    secret_value = "super_confidential_credit_card_4111222233334444"
    payload = build_audit_payload(
        agent_id=uuid4(),
        tool="payment.charge",
        args={"card": secret_value, "amount": 5000},
        data_classes=["credit_card"],
        outcome="allow",
    )
    entry = await append_audit_log(db_session, payload)

    # Ensure secret string does NOT appear anywhere in the database entry
    import json

    raw_stored = json.dumps(entry.payload_json)
    assert secret_value not in raw_stored
    assert "args_hash" in entry.payload_json
    assert entry.payload_json["data_classes"] == ["credit_card"]


@pytest.mark.asyncio
async def test_audit_checkpoint_signed_and_verified(db_session: AsyncSession) -> None:
    """Verify that creating an HMAC-signed checkpoint registers and passes verification."""
    from app.audit.service import create_checkpoint

    agent_id = uuid4()
    for i in range(1, 6):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"n": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    cp = await create_checkpoint(db_session)
    assert cp is not None
    assert cp.seq == 5
    assert len(cp.signature) == 64

    res = await verify_audit_chain(db_session)
    assert res.valid is True
    assert res.total_records == 5
    assert res.checkpoints_verified == 1


@pytest.mark.asyncio
async def test_audit_checkpoint_detects_tail_truncation(db_session: AsyncSession) -> None:
    """Tamper test: Deleting the tail rows after a checkpoint must fail verification."""
    from app.audit.service import create_checkpoint

    agent_id = uuid4()
    for i in range(1, 6):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"n": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    # Checkpoint taken at head seq 5
    await create_checkpoint(db_session)

    # Attacker deletes tail rows (seq 4 and 5)
    await db_session.execute(delete(AuditLog).where(AuditLog.seq >= 4))
    await db_session.commit()

    # Verification must catch tail truncation
    res = await verify_audit_chain(db_session)
    assert res.valid is False
    assert res.broken_seq == 5
    assert res.error is not None
    assert "Tail truncation detected" in res.error


@pytest.mark.asyncio
async def test_audit_checkpoint_detects_chain_rewriting(db_session: AsyncSession) -> None:
    """
    Tamper test: Full-chain hash recomputation after altering past records
    is caught by checkpoint head_hash comparison.
    """
    from app.audit.service import canonical_json, compute_audit_hash, create_checkpoint

    agent_id = uuid4()
    for i in range(1, 6):
        payload = build_audit_payload(
            agent_id=agent_id,
            tool=f"tool_{i}",
            args={"n": i},
            data_classes=[],
            outcome="allow",
        )
        await append_audit_log(db_session, payload)

    # Take signed checkpoint at seq 5
    await create_checkpoint(db_session)

    # Attacker modifies seq 1 payload and recomputes the entire chain from seq 1 to 5
    stmt = select(AuditLog).order_by(AuditLog.seq.asc())
    records = list((await db_session.execute(stmt)).scalars().all())

    # Alter seq 1
    new_payload = dict(records[0].payload_json)
    new_payload["reason"] = "forged_past"
    records[0].payload_json = new_payload
    prev = GENESIS_PREV_HASH
    for r in records:
        r.prev_hash = prev
        r.hash = compute_audit_hash(prev, canonical_json(r.payload_json))
        prev = r.hash
    await db_session.commit()

    # Internal links are technically consistent, but seq 5 head_hash != checkpoint head_hash!
    res = await verify_audit_chain(db_session)
    assert res.valid is False
    assert res.broken_seq == 5
    assert res.error is not None
    assert "Chain rewriting detected" in res.error


@pytest.mark.asyncio
async def test_audit_checkpoint_tampered_signature_detected(
    db_session: AsyncSession,
) -> None:
    """Tamper test: Forging or altering a checkpoint signature fails verification."""
    from app.audit.service import create_checkpoint
    from app.models.audit import AuditCheckpoint

    payload = build_audit_payload(
        agent_id=uuid4(),
        tool="test.tool",
        args={},
        data_classes=[],
        outcome="allow",
    )
    await append_audit_log(db_session, payload)
    await create_checkpoint(db_session)

    # Corrupt the signature in AuditCheckpoint table
    await db_session.execute(update(AuditCheckpoint).values(signature="f" * 64))
    await db_session.commit()

    res = await verify_audit_chain(db_session)
    assert res.valid is False
    assert res.error is not None
    assert "signature invalid or tampered" in res.error
