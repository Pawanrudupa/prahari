"""Pydantic schemas for Policy RAG ingestion and hybrid search."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


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
    section_title: str | None = None
    text: str
    checksum_sha256: str
    meta: dict[str, Any] | None = None


class RAGSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    tau_vector: float = Field(default=0.65, ge=0.0, le=1.0)
    tau_lexical: float = Field(default=0.05, ge=0.0, le=10.0)
    vector_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    text_weight: float = Field(default=0.3, ge=0.0, le=1.0)


class RAGSearchResultItem(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section_title: str | None = None
    text: str
    checksum_sha256: str
    cosine_similarity: float | None = None
    lexical_rank: float | None = None
    rrf_score: float
    grounded: bool = True


class RAGSearchResponse(BaseModel):
    query: str
    retrieval_mode: Literal["hybrid", "vector_only", "lexical_only", "empty"]
    total_matches: int
    results: list[RAGSearchResultItem]


class LoadSampleDocsResponse(BaseModel):
    loaded_count: int
    skipped_count: int
    documents: list[PolicyDocumentResponse]
