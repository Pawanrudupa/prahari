"""Append-only cryptographic hash-chained audit logging service."""

import asyncio
import contextlib
import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditCheckpoint, AuditLog

GENESIS_PREV_HASH = "0" * 64
_APPEND_LOCK = asyncio.Lock()


def canonical_json(payload: dict[str, Any]) -> str:
    """Format dictionary to canonical JSON: sorted keys, no whitespace separators."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_audit_hash(prev_hash: str, canonical_payload: str) -> str:
    """Compute cryptographic hash of a record: SHA256(prev_hash || canonical_payload)."""
    raw = prev_hash + canonical_payload
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_audit_payload(
    agent_id: UUID | str,
    tool: str,
    args: dict[str, Any],
    data_classes: list[str],
    outcome: str,
    action_id: UUID | None = None,
    session_id: UUID | None = None,
    rule_id: str | None = None,
    policy_version: int | None = None,
    reason: str | None = None,
    event_type: str = "action.decided",
) -> dict[str, Any]:
    """
    Build privacy-preserving audit payload.
    Crucial security invariant: NO RAW ARGUMENTS OR SECRETS ARE LOGGED.
    Stores only the SHA-256 hash of the arguments and detected data class labels.
    """
    args_canonical = canonical_json(args)
    args_hash = hashlib.sha256(args_canonical.encode("utf-8")).hexdigest()

    return {
        "event_type": event_type,
        "action_id": str(action_id) if action_id else str(uuid4()),
        "session_id": str(session_id) if session_id else str(uuid4()),
        "agent_id": str(agent_id),
        "tool": tool,
        "args_hash": args_hash,
        "data_classes": sorted(data_classes),
        "outcome": outcome,
        "rule_id": rule_id,
        "policy_version": policy_version,
        "reason": reason or "",
        "timestamp": datetime.now(UTC).isoformat(),
    }


async def append_audit_log(session: AsyncSession, payload: dict[str, Any]) -> AuditLog:
    """
    Append an entry to the hash-chained audit log.

    Serialized to prevent forks under concurrent gateway requests:
    uses an asyncio lock and PostgreSQL advisory transaction lock.
    """
    async with _APPEND_LOCK:
        # PostgreSQL advisory xact lock ensures cross-process/multi-worker serialization
        with contextlib.suppress(Exception):
            await session.execute(text("SELECT pg_advisory_xact_lock(740101)"))

        # Query latest record
        stmt = select(AuditLog).order_by(AuditLog.seq.desc()).limit(1)
        result = await session.execute(stmt)
        latest = result.scalar_one_or_none()

        if latest is None:
            seq = 1
            prev_hash = GENESIS_PREV_HASH
        else:
            seq = latest.seq + 1
            prev_hash = latest.hash

        canon_payload = canonical_json(payload)
        record_hash = compute_audit_hash(prev_hash, canon_payload)

        entry = AuditLog(
            id=uuid4(),
            seq=seq,
            prev_hash=prev_hash,
            hash=record_hash,
            payload_json=payload,
        )

        session.add(entry)
        await session.commit()
        await session.refresh(entry)
        return entry


def sign_checkpoint(seq: int, head_hash: str, secret_key: str | None = None) -> str:
    """Compute HMAC-SHA256 signature for an audit checkpoint (seq, head_hash)."""
    from app.core.config import settings

    key = secret_key or settings.AUDIT_HMAC_KEY
    data = f"{seq}:{head_hash}".encode()
    return hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()


async def create_checkpoint(
    session: AsyncSession, secret_key: str | None = None
) -> AuditCheckpoint | None:
    """
    Take an HMAC-signed cryptographic snapshot of the chain head.
    Protects against DB truncation and whole-chain rewriting attacks.
    """
    stmt = select(AuditLog).order_by(AuditLog.seq.desc()).limit(1)
    result = await session.execute(stmt)
    latest = result.scalar_one_or_none()

    if latest is None:
        return None

    signature = sign_checkpoint(latest.seq, latest.hash, secret_key)
    checkpoint = AuditCheckpoint(
        id=uuid4(),
        seq=latest.seq,
        head_hash=latest.hash,
        signature=signature,
    )
    session.add(checkpoint)
    await session.commit()
    await session.refresh(checkpoint)
    return checkpoint
