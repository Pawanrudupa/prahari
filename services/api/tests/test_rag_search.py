"""Tests for Policy RAG hybrid search, threshold filtering, and archival exclusion."""

import pytest
from httpx import AsyncClient

from app.core.config import settings

ADMIN_HEADERS = {"X-Admin-Token": settings.ADMIN_TOKEN}


@pytest.mark.asyncio
async def test_rag_search_and_retrieval(client: AsyncClient) -> None:
    """Verify hybrid/lexical search finds relevant policy chunks with scores and citations."""
    md_content = b"""# Prahari sample policy (fictional)

# Section 1 Scope and Purpose
This document outlines payment authorization limits.

# Section 2 Dual Authorization Threshold
Any transfer exceeding INR 50,000 requires dual operator sign-off and an escalation token.
Transactions under INR 10,000 may proceed autonomously.
"""
    files = {"file": ("payment_limits.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        data={"title": "Payments Limit Policy"},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201

    # Search for payments exceeding 50,000
    search_payload = {
        "query": "dual authorization INR 50,000",
        "top_k": 3,
        "tau_vector": 0.30,
        "tau_lexical": 0.01,
    }
    s_res = await client.post(
        "/v1/rag/search",
        json=search_payload,
        headers=ADMIN_HEADERS,
    )
    assert s_res.status_code == 200, s_res.text
    data = s_res.json()
    assert data["total_matches"] >= 1
    assert data["retrieval_mode"] in ("hybrid", "vector_only", "lexical_only")
    top_hit = data["results"][0]
    assert "Dual Authorization" in (top_hit["section_title"] or "")
    assert "50,000" in top_hit["text"]
    assert top_hit["grounded"] is True
    assert top_hit["rrf_score"] > 0


@pytest.mark.asyncio
async def test_rag_archived_documents_excluded_from_search(client: AsyncClient) -> None:
    """Verify that archived policy documents are excluded from search results."""
    md_content = b"""# Prahari sample policy (fictional)

# Section 1 Obsolete Encryption Protocol
Legacy system uses 3DES cipher suites which are now prohibited.
"""
    files = {"file": ("obsolete_policy.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        data={"title": "Obsolete Policy"},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Archive it immediately
    await client.post(
        f"/v1/rag/documents/{doc_id}/archive",
        headers=ADMIN_HEADERS,
    )

    # Search for "3DES cipher"
    s_res = await client.post(
        "/v1/rag/search",
        json={"query": "3DES cipher suites prohibited", "top_k": 5},
        headers=ADMIN_HEADERS,
    )
    assert s_res.status_code == 200
    data = s_res.json()
    # Should not match the archived document
    matched_doc_ids = [r["document_id"] for r in data["results"]]
    assert doc_id not in matched_doc_ids


@pytest.mark.asyncio
async def test_rag_natural_language_question_activates_both_legs(client: AsyncClient) -> None:
    """Verify that a natural language question activates both dense vector and lexical legs."""
    md_content = b"""# Prahari sample policy (fictional)

# Section 2 Transaction Thresholds
## Section 2.1 Single-Transaction Limits
Automated agents operating without intervention can initiate transactions
up to a maximum threshold of INR 10,000 per request, provided recipient is validated.
"""
    files = {"file": ("tx_limits_test.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        data={"title": "Single Transaction Limits Test"},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201

    search_payload = {
        "query": "What is the maximum single-transaction limit for an automated payment agent?",
        "top_k": 3,
        "tau_vector": 0.50,
        "tau_lexical": 0.01,
    }
    s_res = await client.post(
        "/v1/rag/search",
        json=search_payload,
        headers=ADMIN_HEADERS,
    )
    assert s_res.status_code == 200
    data = s_res.json()
    assert data["total_matches"] >= 1
    top_hit = data["results"][0]

    # Verify both legs contributed scores when FastEmbed is available
    assert top_hit["lexical_rank"] is not None
    assert top_hit["lexical_rank"] > 0
    if top_hit["cosine_similarity"] is not None:
        assert data["retrieval_mode"] == "hybrid"


@pytest.mark.asyncio
async def test_rag_exact_section_and_term_query_works_lexically(client: AsyncClient) -> None:
    """Verify that exact section numbers and specific financial tokens match lexically."""
    md_content = b"""# Prahari sample policy (fictional)

# Section 2 Transaction Thresholds
## Section 2.1 Single-Transaction Limits
Automated agents operating without intervention can initiate transactions
up to a maximum threshold of INR 10,000 per request.
"""
    files = {"file": ("exact_term_policy.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        data={"title": "Exact Terms Policy"},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201

    search_payload = {
        "query": "Section 2.1 INR 10,000",
        "top_k": 3,
        "tau_vector": 0.0,
        "tau_lexical": 0.01,
    }
    s_res = await client.post(
        "/v1/rag/search",
        json=search_payload,
        headers=ADMIN_HEADERS,
    )
    assert s_res.status_code == 200
    data = s_res.json()
    assert data["total_matches"] >= 1
    top_hit = data["results"][0]
    assert "2.1" in (top_hit["section_title"] or "")
    assert top_hit["lexical_rank"] is not None
    assert top_hit["lexical_rank"] > 0
