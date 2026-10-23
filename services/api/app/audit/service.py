"""Append-only cryptographic hash-chained audit logging service."""

import asyncio
import contextlib
import hashlib
import hmac
import json
import time
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


async def record_admin_audit_event(
    session: AsyncSession,
    event_type: str,
    details: dict[str, Any],
    agent_id: UUID | str | None = None,
    tool: str | None = None,
) -> AuditLog:
    """
    Append an administrative state-change audit event to the hash chain.
    In accordance with AGENTS.md invariant: NO raw secrets or API keys are logged.
    """
    safe_details = {
        k: v
        for k, v in details.items()
        if "secret" not in k.lower() and (k == "key_prefix" or "key" not in k.lower())
    }
    target_val = str(
        agent_id
        or tool
        or details.get("agent_id")
        or details.get("tool_id")
        or details.get("policy_id")
        or details.get("agent_name")
        or details.get("tool_name")
        or "system"
    )
    payload = {
        "event_type": event_type,
        "event_category": "admin",
        "actor": "admin",
        "operation": event_type,
        "target": target_val,
        "agent_id": str(agent_id) if agent_id else "system",
        "tool": tool or "admin",
        "args_hash": hashlib.sha256(canonical_json(safe_details).encode("utf-8")).hexdigest(),
        "data_classes": [],
        "outcome": "admin_action",
        "rule_id": "admin_action",
        "policy_version": 1,
        "reason": f"admin_operation:{event_type}",
        "details": safe_details,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    return await append_audit_log(session, payload)


async def append_audit_log(
    session: AsyncSession,
    payload: dict[str, Any],
    auto_commit: bool = True,
    timings: dict[str, float] | None = None,
) -> AuditLog:
    """
    Append an entry to the hash-chained audit log.

    Serialized to prevent forks under concurrent gateway requests:
    uses an asyncio lock and PostgreSQL advisory transaction lock.
    Optimized for minimal database round-trips, single-transaction support,
    and app-side cryptographic hashing.
    """
    t_lock_start = time.perf_counter()
    async with _APPEND_LOCK:
        # PostgreSQL advisory xact lock ensures cross-process/multi-worker serialization
        with contextlib.suppress(Exception):
            await session.execute(text("SELECT pg_advisory_xact_lock(740101)"))
        t_locked = time.perf_counter()
        if timings is not None:
            timings["lock_wait_ms"] = (t_locked - t_lock_start) * 1000.0

        # Query latest record: fetch only seq and hash columns (fewer round-trip bytes)
        t_query_start = time.perf_counter()
        stmt = select(AuditLog.seq, AuditLog.hash).order_by(AuditLog.seq.desc()).limit(1)
        result = await session.execute(stmt)
        latest_row = result.first()
        t_queried = time.perf_counter()
        if timings is not None:
            timings["query_prev_ms"] = (t_queried - t_query_start) * 1000.0

        if latest_row is None:
            seq = 1
            prev_hash = GENESIS_PREV_HASH
        else:
            seq = latest_row[0] + 1
            prev_hash = latest_row[1]

        # In-app cryptographic hash computation (zero DB round-trips)
        t_hash_start = time.perf_counter()
        canon_payload = canonical_json(payload)
        record_hash = compute_audit_hash(prev_hash, canon_payload)
        t_hashed = time.perf_counter()
        if timings is not None:
            timings["hash_compute_ms"] = (t_hashed - t_hash_start) * 1000.0

        entry = AuditLog(
            id=uuid4(),
            seq=seq,
            prev_hash=prev_hash,
            hash=record_hash,
            payload_json=payload,
        )

        t_insert_start = time.perf_counter()
        session.add(entry)
        t_inserted = time.perf_counter()
        if timings is not None:
            timings["insert_ms"] = (t_inserted - t_insert_start) * 1000.0

        # Automatic checkpoint every N appends per settings
        t_cp_start = time.perf_counter()
        from app.core.config import settings

        interval = settings.AUDIT_CHECKPOINT_INTERVAL
        if interval > 0 and entry.seq % interval == 0:
            with contextlib.suppress(Exception):
                await create_checkpoint(
                    session,
                    auto_commit=auto_commit,
                    head_seq=entry.seq,
                    head_hash=entry.hash,
                )
        t_cp_end = time.perf_counter()
        if timings is not None:
            timings["checkpoint_ms"] = (t_cp_end - t_cp_start) * 1000.0

        if auto_commit:
            t_commit_start = time.perf_counter()
            await session.commit()
            t_committed = time.perf_counter()
            if timings is not None:
                timings["commit_ms"] = (t_committed - t_commit_start) * 1000.0
            # Note: No redundant session.refresh()! All fields are already populated in-memory.

        return entry


def sign_checkpoint(seq: int, head_hash: str, secret_key: str | None = None) -> str:
    """Compute HMAC-SHA256 signature for an audit checkpoint (seq, head_hash)."""
    from app.core.config import settings

    key = secret_key or settings.AUDIT_HMAC_KEY
    data = f"{seq}:{head_hash}".encode()
    return hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()


async def create_checkpoint(
    session: AsyncSession,
    secret_key: str | None = None,
    auto_commit: bool = True,
    head_seq: int | None = None,
    head_hash: str | None = None,
) -> AuditCheckpoint | None:
    """
    Take an HMAC-signed cryptographic snapshot of the chain head.
    Protects against DB truncation and whole-chain rewriting attacks.
    Optimized to eliminate redundant queries and round-trips when head is already known.
    """
    if head_seq is None or head_hash is None:
        stmt = select(AuditLog.seq, AuditLog.hash).order_by(AuditLog.seq.desc()).limit(1)
        result = await session.execute(stmt)
        latest_row = result.first()
        if latest_row is None:
            return None
        head_seq = latest_row[0]
        head_hash = latest_row[1]

    signature = sign_checkpoint(head_seq, head_hash, secret_key)
    checkpoint = AuditCheckpoint(
        id=uuid4(),
        seq=head_seq,
        head_hash=head_hash,
        signature=signature,
    )
    session.add(checkpoint)
    if auto_commit:
        await session.commit()
    return checkpoint
