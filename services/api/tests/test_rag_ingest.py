"""Tests for Policy RAG ingestion, security constraints, and document lifecycle."""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.rag.extractor import sanitize_text

ADMIN_HEADERS = {"X-Admin-Token": settings.ADMIN_TOKEN}


@pytest.mark.asyncio
async def test_text_sanitization() -> None:
    """Verify control chars, zero-width chars, and carriage returns are sanitized."""
    raw = "Header\r\n\u200bSecret\x00Code\u200d\n\n\n\nBody paragraph."
    cleaned = sanitize_text(raw)
    assert "\u200b" not in cleaned
    assert "\u200d" not in cleaned
    assert "\x00" not in cleaned
    assert "\r" not in cleaned
    assert "\n\n\n" not in cleaned
    assert "Header\nSecretCode\n\nBody paragraph." in cleaned


@pytest.mark.asyncio
async def test_ingest_valid_markdown_and_chunks(client: AsyncClient) -> None:
    """Verify standard markdown document upload, chunking, and chunk retrieval."""
    md_content = b"""# Prahari sample policy (fictional)

# Section 1 Scope and Purpose
This document governs testing access to synthetic internal databases.

# Section 2 Access Grants
All agents must possess an explicit grant before querying customer data.
"""
    files = {"file": ("test_policy.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        data={"title": "Test Access Policy"},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201, res.text
    data = res.json()
    doc_id = data["id"]
    assert data["title"] == "Test Access Policy"
    assert data["doc_type"] == "markdown"
    assert data["status"] == "active"
    assert len(data["checksum_sha256"]) == 64

    # Fetch document chunks
    chunks_res = await client.get(
        f"/v1/rag/documents/{doc_id}/chunks",
        headers=ADMIN_HEADERS,
    )
    assert chunks_res.status_code == 200
    chunks = chunks_res.json()
    assert len(chunks) >= 2
    assert any("Scope and Purpose" in (c["section_title"] or "") for c in chunks)
    assert any("Access Grants" in (c["section_title"] or "") for c in chunks)


@pytest.mark.asyncio
async def test_ingest_duplicate_rejection(client: AsyncClient) -> None:
    """Verify that uploading an identical file twice triggers a 409 Conflict."""
    md_content = b"""# Prahari sample policy (fictional)
# Section 1 Unique Duplication Test
This policy tests duplicate SHA-256 hash detection.
"""
    files = {"file": ("dup_policy.md", md_content, "text/markdown")}
    res1 = await client.post(
        "/v1/rag/documents",
        files=files,
        headers=ADMIN_HEADERS,
    )
    assert res1.status_code == 201

    # Second upload with same content
    files2 = {"file": ("dup_policy_renamed.md", md_content, "text/markdown")}
    res2 = await client.post(
        "/v1/rag/documents",
        files=files2,
        headers=ADMIN_HEADERS,
    )
    assert res2.status_code == 409
    assert "identical content already exists" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_ingest_file_too_large(client: AsyncClient) -> None:
    """Verify streaming size verification rejects files exceeding 5 MB with 413."""
    too_large = b"A" * (5 * 1024 * 1024 + 1024)
    files = {"file": ("huge_policy.md", too_large, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 413
    assert "exceeds maximum allowed size" in res.json()["detail"]


@pytest.mark.asyncio
async def test_document_archive_lifecycle(client: AsyncClient) -> None:
    """Verify soft-archive lifecycle: active -> archived (excluded from default list)."""
    md_content = b"""# Prahari sample policy (fictional)
# Section 1 Archival Test
This policy will be archived.
"""
    files = {"file": ("archive_test.md", md_content, "text/markdown")}
    res = await client.post(
        "/v1/rag/documents",
        files=files,
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Archive the document
    arc_res = await client.post(
        f"/v1/rag/documents/{doc_id}/archive",
        headers=ADMIN_HEADERS,
    )
    assert arc_res.status_code == 200
    assert arc_res.json()["status"] == "archived"

    # Default list should exclude it
    list_active = await client.get("/v1/rag/documents", headers=ADMIN_HEADERS)
    assert list_active.status_code == 200
    active_ids = [d["id"] for d in list_active.json()]
    assert doc_id not in active_ids

    # List with include_archived=true should include it
    list_all = await client.get("/v1/rag/documents?include_archived=true", headers=ADMIN_HEADERS)
    assert list_all.status_code == 200
    all_ids = [d["id"] for d in list_all.json()]
    assert doc_id in all_ids
