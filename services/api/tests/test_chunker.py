"""Unit tests for section-aware chunker, heading hierarchy, and banner extraction."""

from app.rag.chunker import chunk_document
from app.rag.extractor import extract_banner_and_clean_text


def test_chunker_never_emits_heading_only_chunks() -> None:
    """Verify parent headings without immediate bodies are not emitted as standalone chunks."""
    text = """# Section 1 Framework Overview
## Section 1.1 Access Principles
Autonomous agents must follow least privilege principles when accessing tools.

## Section 1.2 Capability Grants
Every agent must possess a signed CapabilityGrant before invocation.
"""
    chunks = chunk_document(text)
    # Expected: exactly 2 chunks (one for 1.1, one for 1.2). Heading 1 is NOT emitted alone.
    assert len(chunks) == 2
    for chunk in chunks:
        # Each chunk must have substantive body content, never just a heading line
        assert len(chunk["text"].splitlines()) > 1
        assert "Autonomous agents" in chunk["text"] or "CapabilityGrant" in chunk["text"]


def test_chunker_prepends_parent_hierarchy() -> None:
    """Verify child chunk section_title prepends parent heading hierarchy."""
    text = """# Section 2 Data Classification Framework
## Section 2.1 Agent Role Categorization
Support agents operate with read-only access.
"""
    chunks = chunk_document(text)
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk["section_title"] is not None
    assert "Section 2" in chunk["section_title"]
    assert "2.1" in chunk["section_title"]
    assert " > " in chunk["section_title"]


def test_chunker_extract_banner_from_document() -> None:
    """Verify fictional warning banner is separated from clean content text."""
    raw = """# Prahari sample policy (fictional)

> **WARNING:** This is a fictional policy document generated strictly for Prahari demonstration.
> It does not represent real-world statutes.

# Section 1 Scope
This policy applies to all synthetic agents.
"""
    clean_text, banner = extract_banner_and_clean_text(raw)
    assert banner is not None
    assert "WARNING:" in banner
    assert "This is a fictional policy document" in banner
    assert "WARNING:" not in clean_text
    assert "Section 1 Scope" in clean_text

    chunks = chunk_document(clean_text)
    assert len(chunks) == 1
    assert "WARNING:" not in chunks[0]["text"]
    assert "Section 1 Scope" in chunks[0]["text"]


def test_chunker_sliding_window_for_large_sections() -> None:
    """Verify long sections are split on paragraph boundaries within target size."""
    para1 = "Paragraph one with detailed instructions. " * 20  # ~880 chars
    para2 = "Paragraph two with additional security controls. " * 20  # ~980 chars
    full_text = f"# Section 3 Operations\n\n{para1}\n\n{para2}"

    chunks = chunk_document(full_text, target_size=1000)
    assert len(chunks) >= 2
    for c in chunks:
        assert c["section_title"] == "Section 3 Operations"
        assert len(c["text"]) <= 1200
