"""Offline extractive and template-based decision explainer with snapshot immutability.

Decomposes every explanation into:
1. Deterministic 'Why': derived from DB facts and fixed reason catalogs. Never uses retrieval.
2. Declared Sources: authoritative policy clauses attached to rules in DSL,
   verified to exist in the corpus, labeled 'Declared basis (verified to exist)'.
3. Suggested Sources: topical matches from the frozen retrieval engine (closest clause tier only),
   clearly labeled 'Related, not authoritative'.
4. Immutability & Reproducibility: persisted in explanation_snapshots as of first explanation.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.models.agent import Agent
from app.models.decision import Decision, ExplanationSnapshot
from app.models.policy import Policy, PolicyChunk, PolicyDocument, PolicyVersion
from app.models.session import Action, Session
from app.models.tool import Tool
from app.policy.loader import load_policy_from_yaml
from app.policy.schemas import PolicyDefinition, PolicyRule
from app.rag.constants import TIER_CLOSEST_CLAUSE
from app.rag.service import compute_corpus_hash, search_policy_corpus
from app.schemas.rag import (
    DecisionExplanationResponse,
    DeclaredSourceItem,
    SuggestedSourceItem,
)

logger = logging.getLogger("prahari.rag.explainer")

EXPLAINER_VERSION: str = "v1.0-offline"

# Canonical reason catalog for non-rule / system decisions (NEVER use retrieval)
NON_RULE_REASONS: dict[str, str] = {
    "tool_not_granted": (
        "Action denied because tool '{tool_name}' has no active CapabilityGrant "
        "for agent '{agent_name}'."
    ),
    "default_deny": (
        "Action denied because no matching rule was found and policy defaults to fail-closed deny."
    ),
    "engine_error": "Action denied due to an internal gateway evaluation error (fail closed).",
    "limits_unavailable": "Action denied because rate/budget limit service was unreachable.",
    "approval_pending": "Action escalated and awaiting human officer sign-off.",
    "approval_rejected": "Action denied following human officer rejection.",
    "limits_exceeded": "Action denied because velocity or rate limit was exceeded.",
    "rate_limited": "Action denied because transaction velocity or daily limit was exceeded.",
    "approval_expired": "Action denied because approval window has expired.",
}


async def _resolve_policy_version_and_rule(
    session: AsyncSession,
    policy_version_id: UUID | None,
    rule_id: str | None,
) -> tuple[PolicyDefinition | None, PolicyRule | None, int | None]:
    """Resolve policy definition and rule from policy_version_id (NOT active version)."""
    if not policy_version_id:
        # Fallback to active policy if decision has no version recorded
        stmt = (
            select(PolicyVersion)
            .join(Policy, Policy.active_version_id == PolicyVersion.id)
            .where(Policy.status == "active")
        )
        res = await session.execute(stmt)
        ver_obj = res.scalar_one_or_none()
    else:
        stmt = select(PolicyVersion).where(PolicyVersion.id == policy_version_id)
        res = await session.execute(stmt)
        ver_obj = res.scalar_one_or_none()

    if not ver_obj:
        # Fallback to local default policy file if database has no seeded policy yet
        try:
            from app.gateway.pipeline import get_fallback_policy

            policy_def = get_fallback_policy()
            target_rule: PolicyRule | None = None
            if rule_id:
                for r in policy_def.rules:
                    if r.id == rule_id:
                        target_rule = r
                        break
            return policy_def, target_rule, policy_def.version or 1
        except Exception:
            return None, None, None

    try:
        policy_def = load_policy_from_yaml(ver_obj.yaml)
    except Exception as exc:
        logger.warning(f"Failed to parse policy YAML for version {ver_obj.id}: {exc}")
        return None, None, ver_obj.version

    target_rule = None
    if rule_id:
        for r in policy_def.rules:
            if r.id == rule_id:
                target_rule = r
                break

    return policy_def, target_rule, ver_obj.version


def _build_deterministic_why(
    decision: Decision,
    action: Action | None,
    agent: Agent | None,
    tool: Tool | None,
    rule: PolicyRule | None,
    policy_name: str | None,
    policy_version_num: int | None,
) -> tuple[dict[str, Any], bool]:
    """Build deterministic why dictionary using DB facts and reason catalog.

    Returns:
        (why_dict, is_non_rule_decision)
    """
    tool_name = tool.name if tool else "unknown"
    agent_name = agent.name if agent else (agent.role if agent else "unknown")
    agent_role = agent.role if agent else "unknown"
    data_classes = list(action.data_classes or []) if action else []
    outcome = decision.outcome.lower()

    # Check non-rule / system reason catalog
    reason_code = str(decision.reason or "").lower().strip()
    is_non_rule = (
        not rule
        or reason_code in NON_RULE_REASONS
        or decision.rule_id is None
        or decision.rule_id == "admin_action"
    )

    if is_non_rule or rule is None:
        template = NON_RULE_REASONS.get(
            reason_code,
            NON_RULE_REASONS.get("default_deny" if outcome == "deny" else "engine_error", ""),
        )
        if not template:
            template = f"Decision {outcome.upper()}: {decision.reason or 'System evaluation'}"

        formatted_reason = template.format(tool_name=tool_name, agent_name=agent_name)
        return {
            "outcome": outcome,
            "rule_id": decision.rule_id,
            "policy_version": policy_version_num,
            "policy_name": policy_name or "system",
            "reason": formatted_reason,
            "rule_description": None,
            "data_classes": data_classes,
            "tool": tool_name,
            "agent_name": agent_name,
            "agent_role": agent_role,
            "is_rule_decision": False,
        }, True

    # Rule-governed decision
    rule_desc = rule.description or rule.id
    rule_summary = (
        f"Evaluated policy rule '{rule.id}' under policy '{policy_name or 'prahari'}' "
        f"v{policy_version_num or 1} resulting in {outcome.upper()}."
    )
    return {
        "outcome": outcome,
        "rule_id": rule.id,
        "policy_version": policy_version_num,
        "policy_name": policy_name or "prahari",
        "reason": decision.reason or rule_summary,
        "rule_description": rule_desc,
        "data_classes": data_classes,
        "tool": tool_name,
        "agent_name": agent_name,
        "agent_role": agent_role,
        "is_rule_decision": True,
    }, False


async def _verify_declared_sources(
    session: AsyncSession,
    rule: PolicyRule | None,
) -> tuple[list[DeclaredSourceItem], bool]:
    """Look up and verify declared sources attached to a rule in the active/archived corpus."""
    if not rule or not rule.sources:
        return [], False

    declared_items: list[DeclaredSourceItem] = []

    # Pre-fetch all documents
    doc_res = await session.execute(select(PolicyDocument))
    docs = doc_res.scalars().all()
    doc_by_source = {d.source.lower().strip(): d for d in docs if d.source}
    doc_by_title = {d.title.lower().strip(): d for d in docs}

    for src in rule.sources:
        src_key = src.document.lower().strip()
        matched_doc = doc_by_source.get(src_key) or doc_by_title.get(src_key)
        if not matched_doc:
            logger.warning(
                f"Declared document '{src.document}' for rule '{rule.id}' not found in corpus"
            )
            continue

        target_sec = (src.section_id or src.section).lower().strip()
        chunk_stmt = (
            select(PolicyChunk)
            .where(PolicyChunk.document_id == matched_doc.id)
            .order_by(PolicyChunk.chunk_index.asc())
        )
        c_res = await session.execute(chunk_stmt)
        chunks = c_res.scalars().all()

        matched_chunk: PolicyChunk | None = None
        for c in chunks:
            if c.section_id and c.section_id.lower().strip() == target_sec:
                matched_chunk = c
                break
            if c.section_title and target_sec in c.section_title.lower():
                matched_chunk = c
                break

        if matched_chunk:
            is_archived = matched_doc.status == "archived"
            declared_items.append(
                DeclaredSourceItem(
                    chunk_id=matched_chunk.id,
                    document_id=matched_doc.id,
                    document_title=matched_doc.title,
                    section_id=matched_chunk.section_id,
                    section_title=matched_chunk.section_title,
                    excerpt=matched_chunk.text,
                    checksum_sha256=matched_chunk.checksum_sha256,
                    is_archived=is_archived,
                    label="Declared basis (verified to exist)",
                )
            )

    grounded = len(declared_items) > 0
    return declared_items, grounded


async def _get_suggested_sources(
    session: AsyncSession,
    rule: PolicyRule | None,
    tool: Tool | None,
    policy_version_id: UUID | None,
    corpus_hash: str,
) -> list[SuggestedSourceItem]:
    """Retrieve topical suggestions using the frozen engine (Closest clause tier only).

    Builds query strictly from rule id/description and tool name (never raw arguments).
    Caches in Redis by (policy_version_id, rule_id, corpus_hash, explainer_version).
    """
    if not rule:
        return []

    cache_key = (
        f"explain:retrieval:{policy_version_id or 'none'}:"
        f"{rule.id}:{corpus_hash}:{EXPLAINER_VERSION}"
    )

    # 1. Check Redis cache
    if redis_client is not None:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                parsed = json.loads(cached_data)
                return [SuggestedSourceItem(**item) for item in parsed]
        except Exception as exc:
            logger.debug(f"Redis cache lookup failed for {cache_key}: {exc}")

    # 2. Construct safe retrieval query without raw arguments
    tool_part = tool.name if tool else ""
    query_parts = [rule.description or rule.id, tool_part]
    safe_query = " ".join(p for p in query_parts if p).strip()

    if not safe_query:
        return []

    # 3. Query frozen retrieval engine
    _, search_results = await search_policy_corpus(
        session=session,
        query=safe_query,
        top_k=3,
    )

    # Only include items that passed all gates (Closest clause tier)
    suggested_items: list[SuggestedSourceItem] = []
    for hit in search_results:
        if hit.match_tier == TIER_CLOSEST_CLAUSE:
            suggested_items.append(
                SuggestedSourceItem(
                    chunk_id=hit.chunk_id,
                    document_id=hit.document_id,
                    document_title=hit.document_title,
                    section_id=hit.section_id,
                    section_title=hit.section_title,
                    excerpt=hit.text,
                    checksum_sha256=hit.checksum_sha256,
                    cosine_similarity=hit.cosine_similarity,
                    coverage_score=hit.coverage_score,
                    rare_term_matched=hit.rare_term_matched,
                    match_tier=hit.match_tier,
                    label="Related, not authoritative",
                )
            )

    # 4. Save to Redis cache (1 hour TTL)
    if redis_client is not None:
        try:
            cache_val = json.dumps([s.model_dump(mode="json") for s in suggested_items])
            await redis_client.set(cache_key, cache_val, ex=3600)
        except Exception as exc:
            logger.debug(f"Redis cache write failed for {cache_key}: {exc}")

    return suggested_items


async def explain_decision(
    session: AsyncSession,
    decision_id: UUID,
) -> DecisionExplanationResponse:
    """Generate or retrieve immutable explanation for a decision.

    Guarantees:
    - Server-side facts only; zero raw arguments in responses, logs, or snapshots.
    - Snapshot immutability enforced at DB level.
    - Historical policy version consistency (uses decision's own policy_version_id).
    - Declared basis verified; grounded: true only when declared sources exist.
    """
    # 1. Fetch Decision and related entities
    dec_stmt = select(Decision).where(Decision.id == decision_id)
    dec_res = await session.execute(dec_stmt)
    decision = dec_res.scalar_one_or_none()

    if not decision:
        # Check if decision_id was passed as an AuditLog.id
        from app.models.audit import AuditLog

        audit_res = await session.execute(select(AuditLog).where(AuditLog.id == decision_id))
        audit_row = audit_res.scalar_one_or_none()
        if audit_row and audit_row.payload_json:
            target_dec_id = audit_row.payload_json.get("decision_id")
            if target_dec_id:
                with contextlib.suppress(Exception):
                    dec_res = await session.execute(
                        select(Decision).where(Decision.id == UUID(target_dec_id))
                    )
                    decision = dec_res.scalar_one_or_none()
            if not decision:
                target_act_id = audit_row.payload_json.get("action_id")
                if target_act_id:
                    with contextlib.suppress(Exception):
                        dec_res = await session.execute(
                            select(Decision).where(Decision.action_id == UUID(target_act_id))
                        )
                        decision = dec_res.scalar_one_or_none()

    if not decision:
        # Check if decision_id was passed as an Action.id
        dec_act_res = await session.execute(
            select(Decision).where(Decision.action_id == decision_id)
        )
        decision = dec_act_res.scalar_one_or_none()

    if not decision:
        raise HTTPException(status_code=404, detail=f"Decision '{decision_id}' not found")

    # Use the resolved decision.id from here onwards
    decision_id = decision.id

    # Fetch Action, Agent, Tool
    act_stmt = select(Action).where(Action.id == decision.action_id)
    act_res = await session.execute(act_stmt)
    action = act_res.scalar_one_or_none()

    agent: Agent | None = None
    tool: Tool | None = None
    if action:
        sess_res = await session.execute(select(Session).where(Session.id == action.session_id))
        session_rec = sess_res.scalar_one_or_none()
        if session_rec:
            agent_res = await session.execute(select(Agent).where(Agent.id == session_rec.agent_id))
            agent = agent_res.scalar_one_or_none()
        # Direct tool query
        t_res = await session.execute(select(Tool).where(Tool.id == action.tool_id))
        tool = t_res.scalar_one_or_none()

    # 2. Check if explanation snapshot already exists
    snap_stmt = select(ExplanationSnapshot).where(ExplanationSnapshot.decision_id == decision_id)
    snap_res = await session.execute(snap_stmt)
    snapshot = snap_res.scalar_one_or_none()

    if snapshot:
        # Check if any declared source document is archived in the active database
        doc_res = await session.execute(select(PolicyDocument.id, PolicyDocument.status))
        doc_status_map = {row[0]: row[1] for row in doc_res.all()}

        declared_items = [
            DeclaredSourceItem(
                chunk_id=UUID(item["chunk_id"]),
                document_id=UUID(item["document_id"]),
                document_title=item["document_title"],
                section_id=item.get("section_id"),
                section_title=item.get("section_title"),
                excerpt=item["excerpt"],
                checksum_sha256=item["checksum_sha256"],
                is_archived=(doc_status_map.get(UUID(item["document_id"])) == "archived"),
                label=item.get("label", "Declared basis (verified to exist)"),
            )
            for item in (snapshot.declared_sources or [])
        ]
        suggested_items = [
            SuggestedSourceItem(
                chunk_id=UUID(item["chunk_id"]),
                document_id=UUID(item["document_id"]),
                document_title=item["document_title"],
                section_id=item.get("section_id"),
                section_title=item.get("section_title"),
                excerpt=item["excerpt"],
                checksum_sha256=item["checksum_sha256"],
                cosine_similarity=item.get("cosine_similarity"),
                coverage_score=item.get("coverage_score", 0.0),
                rare_term_matched=item.get("rare_term_matched", False),
                match_tier=item.get("match_tier", TIER_CLOSEST_CLAUSE),
                label=item.get("label", "Related, not authoritative"),
            )
            for item in (snapshot.suggested_sources or [])
        ]

        status_lbl = (
            "Declared basis (verified to exist)"
            if snapshot.grounded
            else "No declared source. Suggestions are topical only"
        )
        return DecisionExplanationResponse(
            decision_id=snapshot.decision_id,
            policy_version_id=snapshot.policy_version_id,
            corpus_hash=snapshot.corpus_hash,
            explainer_version=snapshot.explainer_version,
            snapshot_sha256=snapshot.snapshot_sha256,
            as_of="as of first explanation",
            grounded=snapshot.grounded,
            status_label=status_lbl,
            why=snapshot.why,
            declared_sources=declared_items,
            suggested_sources=suggested_items,
            created_at=snapshot.created_at,
        )

    # 3. Generate first explanation
    corpus_hash = await compute_corpus_hash(session)
    policy_def, rule, version_num = await _resolve_policy_version_and_rule(
        session, decision.policy_version_id, decision.rule_id
    )

    why_dict, is_non_rule = _build_deterministic_why(
        decision=decision,
        action=action,
        agent=agent,
        tool=tool,
        rule=rule,
        policy_name=policy_def.policy if policy_def else None,
        policy_version_num=version_num,
    )

    declared_items, grounded = await _verify_declared_sources(session, rule)

    # Suggested sources (never run retrieval for non-rule decisions)
    if is_non_rule:
        suggested_items = []
    else:
        suggested_items = await _get_suggested_sources(
            session=session,
            rule=rule,
            tool=tool,
            policy_version_id=decision.policy_version_id,
            corpus_hash=corpus_hash,
        )

    # Compute canonical SHA-256
    canonical_dict = {
        "decision_id": str(decision_id),
        "policy_version_id": str(decision.policy_version_id)
        if decision.policy_version_id
        else None,
        "corpus_hash": corpus_hash,
        "explainer_version": EXPLAINER_VERSION,
        "grounded": grounded,
        "why": why_dict,
        "declared_sources": [s.model_dump(mode="json") for s in declared_items],
        "suggested_sources": [s.model_dump(mode="json") for s in suggested_items],
    }
    canonical_raw = json.dumps(canonical_dict, sort_keys=True)
    snapshot_sha = hashlib.sha256(canonical_raw.encode("utf-8")).hexdigest()

    # 4. Insert snapshot with ON CONFLICT DO NOTHING for concurrent safety
    is_postgres = session.bind is not None and "postgresql" in session.bind.dialect.name
    now_dt = datetime.now(UTC)

    if is_postgres:
        stmt = (
            pg_insert(ExplanationSnapshot)
            .values(
                id=uuid4(),
                decision_id=decision_id,
                policy_version_id=decision.policy_version_id,
                corpus_hash=corpus_hash,
                explainer_version=EXPLAINER_VERSION,
                snapshot_sha256=snapshot_sha,
                grounded=grounded,
                why=why_dict,
                declared_sources=[s.model_dump(mode="json") for s in declared_items],
                suggested_sources=[s.model_dump(mode="json") for s in suggested_items],
                created_at=now_dt,
            )
            .on_conflict_do_nothing(index_elements=["decision_id"])
        )
        await session.execute(stmt)
        await session.commit()
    else:
        # SQLite fallback for test harness
        try:
            snap_obj = ExplanationSnapshot(
                id=uuid4(),
                decision_id=decision_id,
                policy_version_id=decision.policy_version_id,
                corpus_hash=corpus_hash,
                explainer_version=EXPLAINER_VERSION,
                snapshot_sha256=snapshot_sha,
                grounded=grounded,
                why=why_dict,
                declared_sources=[s.model_dump(mode="json") for s in declared_items],
                suggested_sources=[s.model_dump(mode="json") for s in suggested_items],
                created_at=now_dt,
            )
            session.add(snap_obj)
            await session.commit()
        except Exception:
            await session.rollback()

    status_lbl = (
        "Declared basis (verified to exist)"
        if grounded
        else "No declared source. Suggestions are topical only"
    )

    return DecisionExplanationResponse(
        decision_id=decision_id,
        policy_version_id=decision.policy_version_id,
        corpus_hash=corpus_hash,
        explainer_version=EXPLAINER_VERSION,
        snapshot_sha256=snapshot_sha,
        as_of="as of first explanation",
        grounded=grounded,
        status_label=status_lbl,
        why=why_dict,
        declared_sources=declared_items,
        suggested_sources=suggested_items,
        created_at=now_dt,
    )
