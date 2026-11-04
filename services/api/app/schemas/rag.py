"""Pydantic schemas for Policy RAG ingestion, hybrid search, and explanation snapshots."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.rag.constants import (
    DEFAULT_TAU_LEXICAL,
    DEFAULT_TAU_VECTOR,
    DEFAULT_TEXT_WEIGHT,
    DEFAULT_VECTOR_WEIGHT,
    TIER_CLOSEST_CLAUSE,
)


class PolicyDocumentResponse(BaseModel):
    id: UUID
    title: str
    source: str | None = None
    doc_type: str
    file_size_bytes: int
    checksum_sha256: str
    status: str
    chunk_count: int = 0
    uploaded_at: datetime
    archived_at: datetime | None = None


class PolicyChunkResponse(BaseModel):
    id: UUID
    document_id: UUID
    document_title: str | None = None
    chunk_index: int
    section_id: str | None = None
    section_title: str | None = None
    text: str
    checksum_sha256: str
    meta: dict[str, Any] | None = None


class RAGSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    tau_vector: float = Field(default=DEFAULT_TAU_VECTOR, ge=0.0, le=1.0)
    tau_lexical: float = Field(default=DEFAULT_TAU_LEXICAL, ge=0.0, le=10.0)
    vector_weight: float = Field(default=DEFAULT_VECTOR_WEIGHT, ge=0.0, le=10.0)
    text_weight: float = Field(default=DEFAULT_TEXT_WEIGHT, ge=0.0, le=10.0)


class RAGSearchResultItem(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section_id: str | None = None
    section_title: str | None = None
    text: str
    checksum_sha256: str
    cosine_similarity: float | None = None
    lexical_rank: float | None = None
    rrf_score: float
    coverage_score: float = 0.0
    rare_term_matched: bool = False
    match_tier: Literal[
        "closest_clause",
        "weakly_related",
        "no_relevant_clause",
        "strong_match",
        "related_unverified",
    ] = TIER_CLOSEST_CLAUSE
    rerank_score: float | None = None
    grounded: bool = False


class RAGSearchResponse(BaseModel):
    query: str
    retrieval_mode: Literal["hybrid", "vector_only", "lexical_only", "empty"]
    total_matches: int
    results: list[RAGSearchResultItem]
    standing_note: str = (
        "Retrieval finds related text; it cannot confirm that the clause states "
        "the currency, period, role or value you asked about."
    )


class LoadSampleDocsResponse(BaseModel):
    loaded_count: int
    skipped_count: int
    documents: list[PolicyDocumentResponse]


# =============================================================================
# Decision Explanation & Grounding Verification Schemas (Milestone 4b)
# =============================================================================


class DeclaredSourceItem(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section_id: str | None = None
    section_title: str | None = None
    excerpt: str
    checksum_sha256: str
    is_archived: bool = False
    label: str = "Declared basis (verified to exist)"


class SuggestedSourceItem(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section_id: str | None = None
    section_title: str | None = None
    excerpt: str
    checksum_sha256: str
    cosine_similarity: float | None = None
    coverage_score: float = 0.0
    rare_term_matched: bool = False
    match_tier: str = TIER_CLOSEST_CLAUSE
    label: str = "Related, not authoritative"


class DecisionExplanationResponse(BaseModel):
    decision_id: UUID
    policy_version_id: UUID | None = None
    corpus_hash: str
    explainer_version: str = "v1.0-offline"
    snapshot_sha256: str
    as_of: str = "as of first explanation"
    grounded: bool
    status_label: str
    why: dict[str, Any]
    declared_sources: list[DeclaredSourceItem] = Field(default_factory=list)
    suggested_sources: list[SuggestedSourceItem] = Field(default_factory=list)
    standing_note: str = (
        "Retrieval finds related text; it cannot confirm that the clause states "
        "the currency, period, role or value you asked about."
    )
    created_at: datetime
