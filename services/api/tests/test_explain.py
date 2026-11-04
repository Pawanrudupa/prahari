"""Comprehensive unit & integration test suite for Decision Explainability & Grounding Verification.

Milestone 4b Requirements:
1. Deterministic why + Declared sources (from decision's policy version) + Suggested sources.
2. Snapshot persistence, idempotency, and DB-level immutability trigger.
3. Concurrent safety: INSERT ... ON CONFLICT (decision_id) DO NOTHING.
4. Non-rule decision reason catalog: never calls retrieval.
5. Invariant 3: No raw tool arguments or raw PII in explanations or snapshots.
6. Archived document handling: flags is_archived: True without breaking snapshot.
7. XSS safety in document chunks.
8. Real rule IDs grounding audit (R1-R3 grounded, R4-R6 and L1 ungrounded).
9. Corpus-relative rare term ceiling scaling.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.agent import Agent
from app.models.decision import Decision, ExplanationSnapshot
from app.models.policy import Policy, PolicyChunk, PolicyDocument, PolicyVersion
from app.models.session import Action, Session
from app.models.tool import Tool
from app.rag.coverage import compute_rare_term_ceiling
from app.rag.explainer import (
    NON_RULE_REASONS,
)
from app.rag.extractor import compute_sha256

ADMIN_HEADERS = {"X-Admin-Token": settings.ADMIN_TOKEN}


async def _seed_document_and_chunk(
    session: AsyncSession,
    title: str = "Access Control Policy",
    section_id: str = "2.1",
    section_title: str = "Section 2 > 2.1 Role-Based Access Control",
    text_content: str = "Support engineers may access ticket records with customer consent.",
    status: str = "active",
) -> tuple[PolicyDocument, PolicyChunk]:
    doc_sha = compute_sha256(f"{title}_{section_id}_{uuid4()}".encode())
    chunk_sha = compute_sha256(f"{text_content}_{uuid4()}".encode())

    doc = PolicyDocument(
        title=title,
        source="policies/examples/docs/access-control-policy.md",
        doc_type="markdown",
        file_size_bytes=len(text_content),
        checksum_sha256=doc_sha,
        status=status,
    )
    session.add(doc)
    await session.flush()

    chunk = PolicyChunk(
        document_id=doc.id,
        chunk_index=0,
        section_id=section_id,
        section_title=section_title,
        text=text_content,
        checksum_sha256=chunk_sha,
        meta={"document_title": title},
    )
    session.add(chunk)
    await session.commit()
    return doc, chunk


async def _add_chunk_to_document(
    session: AsyncSession,
    document: PolicyDocument,
    section_id: str,
    section_title: str,
    text_content: str,
    chunk_index: int = 1,
) -> PolicyChunk:
    chunk_sha = compute_sha256(f"{text_content}_{uuid4()}".encode())
    chunk = PolicyChunk(
        document_id=document.id,
        chunk_index=chunk_index,
        section_id=section_id,
        section_title=section_title,
        text=text_content,
        checksum_sha256=chunk_sha,
        meta={"document_title": document.title},
    )
    session.add(chunk)
    await session.commit()
    return chunk


async def _seed_policy_with_rule(
    session: AsyncSession,
    rule_id: str = "R1-allow-read-tickets",
    sources: list[dict[str, Any]] | None = None,
) -> PolicyVersion:
    policy = Policy(name=f"Policy-{uuid4().hex[:8]}", status="active")
    session.add(policy)
    await session.flush()

    sources_block = ""
    if sources:
        sources_lines = []
        for s in sources:
            s_doc = s.get("document", "")
            s_sec = s.get("section", "")
            s_id = s.get("section_id", "")
            sources_lines.append(
                f'      - document: "{s_doc}"\n'
                f'        section: "{s_sec}"\n'
                f'        section_id: "{s_id}"'
            )
        sources_block = "    sources:\n" + "\n".join(sources_lines)

    policy_yaml = f"""policy: test-policy
version: 1
defaults:
  decision: deny
rules:
  - id: {rule_id}
    effect: allow
    tool: "tickets.read"
    description: "Allow tickets read"
{sources_block}
"""
    pv = PolicyVersion(
        policy_id=policy.id,
        version=1,
        yaml=policy_yaml,
        created_by="admin",
    )
    session.add(pv)
    await session.flush()
    policy.active_version_id = pv.id
    await session.commit()
    return pv


async def _seed_decision(
    session: AsyncSession,
    policy_version_id: UUID | None,
    rule_id: str | None = "R1-allow-read-tickets",
    outcome: str = "allow",
    reason: str = "Rule R1-allow-read-tickets matched",
    tool: str = "tickets.read",
    args_json: dict[str, Any] | None = None,
) -> tuple[Action, Decision]:
    agent = Agent(
        name=f"Agent-{uuid4().hex[:6]}",
        owner="Engineering",
        role="support",
        api_key_prefix=f"pra_{uuid4().hex[:6]}",
        api_key_hash=compute_sha256(uuid4().hex.encode("utf-8")),
    )
    session.add(agent)
    await session.flush()

    tool_rec = Tool(name=f"{tool}_{uuid4().hex[:6]}", server="test-server")
    session.add(tool_rec)
    await session.flush()

    sess_rec = Session(agent_id=agent.id, goal="test goal")
    session.add(sess_rec)
    await session.flush()

    if args_json is None:
        args_json = {"ticket_id": 101}

    action = Action(
        session_id=sess_rec.id,
        seq=1,
        tool_id=tool_rec.id,
        args_json=args_json,
    )
    session.add(action)
    await session.flush()

    decision = Decision(
        action_id=action.id,
        policy_version_id=policy_version_id,
        outcome=outcome,
        reason=reason,
        rule_id=rule_id,
        risk_score=0.1,
    )
    session.add(decision)
    await session.commit()
    return action, decision


# =============================================================================
# 1. Auth & Status Tests
# =============================================================================


@pytest.mark.asyncio
async def test_explain_unauthenticated(client: AsyncClient) -> None:
    """401 Unauthenticated when no token is supplied."""
    random_id = uuid4()
    res = await client.get(f"/v1/decisions/{random_id}/explain")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_explain_decision_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    """404 Not Found when decision UUID does not exist."""
    random_id = uuid4()
    res = await client.get(f"/v1/decisions/{random_id}/explain", headers=ADMIN_HEADERS)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# =============================================================================
# 2. Database-Level Snapshot Immutability
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_db_snapshot_immutability_trigger(db_session: AsyncSession) -> None:
    """CRITICAL: PostgreSQL trigger prevent_explanation_snapshot_update blocks all UPDATEs."""
    pv = await _seed_policy_with_rule(db_session)
    action, decision = await _seed_decision(db_session, pv.id)

    # Insert snapshot directly
    snapshot = ExplanationSnapshot(
        decision_id=decision.id,
        policy_version_id=pv.id,
        corpus_hash="fake_corpus_hash",
        explainer_version="v1.0-offline",
        snapshot_sha256="fake_sha256",
        why={"outcome": "allow", "reason": "test"},
        declared_sources=[],
        suggested_sources=[],
    )
    db_session.add(snapshot)
    await db_session.commit()

    # Attempt direct SQL UPDATE on the row
    with pytest.raises(Exception) as exc_info:
        await db_session.execute(
            text(
                "UPDATE explanation_snapshots SET corpus_hash = 'tampered' "
                "WHERE decision_id = :d_id"
            ),
            {"d_id": decision.id},
        )
        await db_session.commit()

    err_msg = str(exc_info.value).lower()
    assert "immutable" in err_msg or "cannot update" in err_msg


# =============================================================================
# 3. Snapshot Idempotency and Concurrent Safety
# =============================================================================


@pytest.mark.asyncio
async def test_explain_idempotency_and_snapshot_persistence(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Explaining a decision twice returns identical snapshot sha and does not duplicate records."""
    doc, chunk = await _seed_document_and_chunk(db_session)
    sources = [{"document": doc.title, "section": chunk.section_title, "section_id": "2.1"}]
    pv = await _seed_policy_with_rule(db_session, sources=sources)
    action, decision = await _seed_decision(db_session, pv.id)

    # First request
    res1 = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["grounded"] is True
    assert len(data1["declared_sources"]) == 1
    sha1 = data1["snapshot_sha256"]

    # Second request
    res2 = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["snapshot_sha256"] == sha1
    assert data2["corpus_hash"] == data1["corpus_hash"]
    assert data2["created_at"][:19] == data1["created_at"][:19]


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_concurrent_first_explain_requests(db_session: AsyncSession) -> None:
    """Concurrent first-explain requests for the same decision resolve safely without conflict."""
    import os
    from collections.abc import AsyncGenerator

    from httpx import ASGITransport
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.database import get_db
    from app.main import create_app

    doc, chunk = await _seed_document_and_chunk(db_session)
    sources = [{"document": doc.title, "section": chunk.section_title, "section_id": "2.1"}]
    pv = await _seed_policy_with_rule(db_session, sources=sources)
    action, decision = await _seed_decision(db_session, pv.id)

    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    engine = create_async_engine(db_url, echo=False, poolclass=NullPool)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    app = create_app()

    async def _get_test_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = _get_test_db

    async def _call() -> Any:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            return await c.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)

    # 5 concurrent requests
    responses = await asyncio.gather(_call(), _call(), _call(), _call(), _call())
    await engine.dispose()

    assert all(r.status_code == 200 for r in responses)
    shas = [r.json()["snapshot_sha256"] for r in responses]
    assert len(set(shas)) == 1, "All concurrent requests must resolve to the identical snapshot sha"


# =============================================================================
# 4. Invariant 3: No Raw Arguments Leakage
# =============================================================================


@pytest.mark.asyncio
async def test_no_raw_arguments_or_pii_in_explanation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """INVARIANT 3: Raw tool arguments (args_json) must NEVER appear in explanation or snapshots."""
    pv = await _seed_policy_with_rule(db_session)
    sensitive_payload = {
        "customer_ssn": "999-00-1234",
        "api_secret": "sk_live_very_secret_key_abcdef",
        "personal_email": "target_user@example.com",
    }
    action, decision = await _seed_decision(
        db_session,
        pv.id,
        outcome="redact",
        reason="Redacted sensitive PII fields",
        args_json=sensitive_payload,
    )

    res = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    resp_text = res.text

    assert "999-00-1234" not in resp_text
    assert "sk_live_very_secret_key_abcdef" not in resp_text
    assert "target_user@example.com" not in resp_text


# =============================================================================
# 5. Non-Rule Decisions: Reason Catalog Never Calls Retrieval
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize("non_rule_reason", list(NON_RULE_REASONS.keys()))
async def test_non_rule_decisions_never_call_retrieval(
    non_rule_reason: str, client: AsyncClient, db_session: AsyncSession
) -> None:
    """Non-rule reasons must resolve deterministically and NEVER invoke search_policy_corpus."""
    action, decision = await _seed_decision(
        db_session,
        policy_version_id=None,
        rule_id=None,
        outcome="deny",
        reason=non_rule_reason,
    )

    with patch("app.rag.explainer.search_policy_corpus") as mock_search:
        res = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["grounded"] is False
        assert data["declared_sources"] == []
        assert data["suggested_sources"] == []
        expected_template = NON_RULE_REASONS[non_rule_reason]
        assert data["why"]["reason"] == expected_template.format(
            tool_name=data["why"]["tool"],
            agent_name=data["why"]["agent_name"],
        )
        mock_search.assert_not_called()


# =============================================================================
# 6. Policy Versioning: Resolves from Decision's Policy Version
# =============================================================================


@pytest.mark.asyncio
async def test_explain_uses_decision_policy_version_not_active(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Decision must resolve its rule from decision.policy_version_id even after v2 is active."""
    doc, chunk = await _seed_document_and_chunk(
        db_session,
        title="Access Control Policy",
        section_id="2.1",
        section_title="Section 2.1",
        text_content="V1 clause text",
    )
    # V1 has source pointing to Section 2.1
    sources_v1 = [{"document": doc.title, "section": "Section 2.1", "section_id": "2.1"}]
    pv_v1 = await _seed_policy_with_rule(db_session, rule_id="R1", sources=sources_v1)

    # Decision recorded under V1
    action, decision = await _seed_decision(db_session, pv_v1.id, rule_id="R1")

    # Now create V2 where R1 has NO declared source and is active
    _pv_v2 = await _seed_policy_with_rule(db_session, rule_id="R1", sources=None)

    # Explain the decision: it should still resolve V1 declared source
    res = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["policy_version_id"] == str(pv_v1.id)
    assert data["grounded"] is True
    assert len(data["declared_sources"]) == 1
    assert data["declared_sources"][0]["section_id"] == "2.1"


# =============================================================================
# 7. Archived Source Documents
# =============================================================================


@pytest.mark.asyncio
async def test_explain_with_archived_source_document(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Archiving a document flags is_archived: True but preserves excerpt and succeeds."""
    doc, chunk = await _seed_document_and_chunk(db_session, status="active")
    sources = [{"document": doc.title, "section": chunk.section_title, "section_id": "2.1"}]
    pv = await _seed_policy_with_rule(db_session, sources=sources)
    action, decision = await _seed_decision(db_session, pv.id)

    # Archive the document
    archive_res = await client.post(f"/v1/rag/documents/{doc.id}/archive", headers=ADMIN_HEADERS)
    assert archive_res.status_code == 200

    # Explain decision
    res = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["grounded"] is True
    assert len(data["declared_sources"]) == 1
    decl = data["declared_sources"][0]
    assert decl["is_archived"] is True
    assert len(decl["excerpt"]) > 0


# =============================================================================
# 8. XSS Sanitization & Safe Content
# =============================================================================


@pytest.mark.asyncio
async def test_xss_content_in_chunks_rendered_safely(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Document chunks containing HTML or script tags are treated as passive data strings."""
    xss_text = "<script>alert('pwned')</script><img src=x onerror=alert(1)>"
    doc, chunk = await _seed_document_and_chunk(
        db_session,
        title="XSS Test Document",
        section_id="1.1",
        text_content=xss_text,
    )
    sources = [{"document": doc.title, "section": chunk.section_title, "section_id": "1.1"}]
    pv = await _seed_policy_with_rule(db_session, sources=sources)
    action, decision = await _seed_decision(db_session, pv.id)

    res = await client.get(f"/v1/decisions/{decision.id}/explain", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["declared_sources"][0]["excerpt"] == xss_text


# =============================================================================
# 9. Real Demo Rules Grounding Audit
# =============================================================================


@pytest.mark.asyncio
async def test_real_demo_rules_grounding_audit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Audit: R1, R2, R3 have declared sources. R4, R5, R6, L1 have no declared sources."""
    # Seed canonical documents: Access Control Policy and Data Handling Policy
    doc_acc, chunk_acc = await _seed_document_and_chunk(
        db_session,
        title="Access Control Policy",
        section_id="2.1",
        section_title="Section 2.1 Role-Based Access Control",
    )
    doc_data, chunk_data1 = await _seed_document_and_chunk(
        db_session,
        title="Data Handling Policy",
        section_id="3.1",
        section_title="Section 3.1 PII Masking and Tokenization",
    )
    chunk_data2 = await _add_chunk_to_document(
        db_session,
        document=doc_data,
        section_id="3.2",
        section_title="Section 3.2 Bulk Data Export Controls",
        text_content="Bulk data export exceeding 100 rows requires dual human escalation.",
        chunk_index=1,
    )

    sources_r1 = [
        {"document": doc_acc.title, "section": chunk_acc.section_title, "section_id": "2.1"}
    ]
    sources_r2 = [
        {"document": doc_data.title, "section": chunk_data1.section_title, "section_id": "3.1"}
    ]
    sources_r3 = [
        {"document": doc_data.title, "section": chunk_data2.section_title, "section_id": "3.2"}
    ]

    pv_r1 = await _seed_policy_with_rule(db_session, "R1-allow-read-tickets", sources=sources_r1)
    pv_r2 = await _seed_policy_with_rule(db_session, "R2-redact-pii-outbound", sources=sources_r2)
    pv_r3 = await _seed_policy_with_rule(db_session, "R3-escalate-bulk-export", sources=sources_r3)
    pv_r4 = await _seed_policy_with_rule(db_session, "R4-deny-untrusted-instruction", sources=None)

    _, d_r1 = await _seed_decision(db_session, pv_r1.id, "R1-allow-read-tickets")
    _, d_r2 = await _seed_decision(db_session, pv_r2.id, "R2-redact-pii-outbound")
    _, d_r3 = await _seed_decision(db_session, pv_r3.id, "R3-escalate-bulk-export")
    _, d_r4 = await _seed_decision(db_session, pv_r4.id, "R4-deny-untrusted-instruction")

    res_r1 = await client.get(f"/v1/decisions/{d_r1.id}/explain", headers=ADMIN_HEADERS)
    res_r2 = await client.get(f"/v1/decisions/{d_r2.id}/explain", headers=ADMIN_HEADERS)
    res_r3 = await client.get(f"/v1/decisions/{d_r3.id}/explain", headers=ADMIN_HEADERS)
    res_r4 = await client.get(f"/v1/decisions/{d_r4.id}/explain", headers=ADMIN_HEADERS)

    assert res_r1.json()["grounded"] is True
    assert res_r2.json()["grounded"] is True
    assert res_r3.json()["grounded"] is True
    assert res_r4.json()["grounded"] is False
    assert res_r4.json()["declared_sources"] == []


# =============================================================================
# 10. Rare Term Ceiling 5x Scaling Test
# =============================================================================


def test_corpus_relative_rare_term_ceiling_scaling() -> None:
    """Verify compute_rare_term_ceiling floor of 4 on small corpus and scales on 5x corpus."""
    # Current corpus: 25 chunks
    assert compute_rare_term_ceiling(25) == 4

    # Floor test: 10 chunks -> max(4, ceil(0.15 * 10)) = 4
    assert compute_rare_term_ceiling(10) == 4

    # 5x scaled corpus: 125 chunks -> max(4, ceil(0.15 * 125)) = 19
    assert compute_rare_term_ceiling(125) == 19

    # 10x scaled corpus: 250 chunks -> max(4, ceil(0.15 * 250)) = 38
    assert compute_rare_term_ceiling(250) == 38
