"""Policy RAG service: Ingestion, Chunking, Hybrid Search & Lifecycle Management."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import append_audit_log
from app.models.policy import PolicyChunk, PolicyDocument
from app.rag.chunker import chunk_document
from app.rag.embeddings import embed_query, embed_texts
from app.rag.extractor import (
    MAX_FILE_SIZE_BYTES,
    compute_sha256,
    extract_markdown,
    extract_pdf,
)
from app.schemas.rag import (
    PolicyChunkResponse,
    PolicyDocumentResponse,
    RAGSearchResultItem,
)

logger = logging.getLogger("prahari.rag.service")


class DuplicateDocumentError(Exception):
    """Raised when an identical policy document (by SHA-256 checksum) already exists."""


class DocumentNotFoundError(Exception):
    """Raised when the specified document ID does not exist."""


async def ingest_policy_document(
    session: AsyncSession,
    title: str,
    filename: str,
    content: bytes,
    doc_type: str = "markdown",
) -> PolicyDocument:
    """Ingest, extract, chunk, embed, and store a policy document in an atomic transaction."""
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File exceeds maximum size of {MAX_FILE_SIZE_BYTES} bytes "
            f"({len(content)} bytes uploaded)"
        )

    checksum = compute_sha256(content)

    # 1. Check for duplicates by SHA-256
    stmt = select(PolicyDocument).where(PolicyDocument.checksum_sha256 == checksum)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing is not None:
        if existing.status == "archived":
            raise DuplicateDocumentError(
                "A policy document with identical content exists in the archive "
                f"(id: {existing.id})"
            )
        raise DuplicateDocumentError(
            f"Policy document '{existing.title}' with identical content already exists "
            f"(id: {existing.id})"
        )

    # 2. Extract and sanitize text
    norm_filename = filename.lower()
    if norm_filename.endswith(".pdf") or doc_type == "pdf":
        extracted_text = await extract_pdf(content)
        detected_type = "pdf"
    else:
        extracted_text = extract_markdown(content)
        detected_type = "markdown"

    # 3. Sliding-window chunking
    chunks_data = chunk_document(extracted_text)
    if not chunks_data:
        raise ValueError("Document yielded no usable text chunks")

    # 4. Generate embeddings (offloaded to thread pool)
    chunk_texts = [c["text"] for c in chunks_data]
    embeddings: list[list[float]] | None = None
    try:
        embeddings = await embed_texts(chunk_texts)
    except Exception as exc:
        logger.warning(
            "Dense embedding generation failed; document will be indexed "
            f"for lexical search only: {exc}"
        )

    # 5. Persist Document entity
    doc_id = uuid4()
    doc = PolicyDocument(
        id=doc_id,
        title=title.strip() or filename,
        source=filename,
        doc_type=detected_type,
        file_size_bytes=len(content),
        checksum_sha256=checksum,
        status="active",
    )
    session.add(doc)
    await session.flush()

    # 6. Persist Chunk entities
    is_postgres = session.bind is not None and "postgresql" in session.bind.dialect.name
    for idx, c in enumerate(chunks_data):
        chunk_emb = embeddings[idx] if embeddings and idx < len(embeddings) else None
        chunk = PolicyChunk(
            id=uuid4(),
            document_id=doc_id,
            chunk_index=c["chunk_index"],
            section_title=c["section_title"],
            text=c["text"],
            checksum_sha256=c["checksum_sha256"],
            embedding=chunk_emb,
            meta=c["meta"],
        )
        if is_postgres:
            # Set PostgreSQL TSVector via server expression
            chunk.tsv = func.to_tsvector("english", c["text"])
        session.add(chunk)

    # 7. Append immutable audit event
    audit_payload = {
        "event_type": "policy_document.uploaded",
        "document_id": str(doc_id),
        "title": doc.title,
        "doc_type": doc.doc_type,
        "file_size_bytes": doc.file_size_bytes,
        "checksum_sha256": checksum,
        "chunk_count": len(chunks_data),
        "timestamp": datetime.now(UTC).isoformat(),
    }
    await append_audit_log(session, audit_payload)
    await session.commit()
    await session.refresh(doc)
    return doc


async def list_policy_documents(
    session: AsyncSession,
    include_archived: bool = False,
) -> list[PolicyDocumentResponse]:
    """List policy documents with associated chunk counts."""
    # Count chunks per document
    count_subquery = (
        select(
            PolicyChunk.document_id,
            func.count(PolicyChunk.id).label("chunk_count"),
        )
        .group_by(PolicyChunk.document_id)
        .subquery()
    )

    query = (
        select(
            PolicyDocument,
            func.coalesce(count_subquery.c.chunk_count, 0).label("chunk_count"),
        )
        .outerjoin(count_subquery, PolicyDocument.id == count_subquery.c.document_id)
        .order_by(PolicyDocument.uploaded_at.desc())
    )

    if not include_archived:
        query = query.where(PolicyDocument.status == "active")

    result = await session.execute(query)
    rows = result.all()

    documents: list[PolicyDocumentResponse] = []
    for doc, count in rows:
        documents.append(
            PolicyDocumentResponse(
                id=doc.id,
                title=doc.title,
                source=doc.source,
                doc_type=doc.doc_type,
                file_size_bytes=doc.file_size_bytes,
                checksum_sha256=doc.checksum_sha256,
                status=doc.status,
                chunk_count=int(count),
                uploaded_at=doc.uploaded_at,
                archived_at=doc.archived_at,
            )
        )
    return documents


async def get_document_chunks(
    session: AsyncSession,
    document_id: UUID,
) -> list[PolicyChunkResponse]:
    """Retrieve all chunks belonging to a policy document in sequential order."""
    doc_stmt = select(PolicyDocument).where(PolicyDocument.id == document_id)
    doc_res = await session.execute(doc_stmt)
    doc = doc_res.scalar_one_or_none()
    if doc is None:
        raise DocumentNotFoundError(f"Document with ID {document_id} not found")

    stmt = (
        select(PolicyChunk)
        .where(PolicyChunk.document_id == document_id)
        .order_by(PolicyChunk.chunk_index.asc())
    )
    result = await session.execute(stmt)
    chunks = result.scalars().all()

    return [
        PolicyChunkResponse(
            id=c.id,
            document_id=c.document_id,
            document_title=doc.title,
            chunk_index=c.chunk_index,
            section_title=c.section_title,
            text=c.text,
            checksum_sha256=c.checksum_sha256,
            meta=c.meta,
        )
        for c in chunks
    ]


async def archive_policy_document(
    session: AsyncSession,
    document_id: UUID,
) -> PolicyDocumentResponse:
    """Soft-archive a policy document. Preserves chunks and audit log rows."""
    stmt = select(PolicyDocument).where(PolicyDocument.id == document_id)
    result = await session.execute(stmt)
    doc = result.scalar_one_or_none()
    if doc is None:
        raise DocumentNotFoundError(f"Document with ID {document_id} not found")

    if doc.status == "archived":
        return PolicyDocumentResponse(
            id=doc.id,
            title=doc.title,
            source=doc.source,
            doc_type=doc.doc_type,
            file_size_bytes=doc.file_size_bytes,
            checksum_sha256=doc.checksum_sha256,
            status=doc.status,
            uploaded_at=doc.uploaded_at,
            archived_at=doc.archived_at,
        )

    doc.status = "archived"
    doc.archived_at = datetime.now(UTC)

    # Append audit event
    audit_payload = {
        "event_type": "policy_document.archived",
        "document_id": str(doc.id),
        "title": doc.title,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    await append_audit_log(session, audit_payload)
    await session.commit()
    await session.refresh(doc)

    return PolicyDocumentResponse(
        id=doc.id,
        title=doc.title,
        source=doc.source,
        doc_type=doc.doc_type,
        file_size_bytes=doc.file_size_bytes,
        checksum_sha256=doc.checksum_sha256,
        status=doc.status,
        uploaded_at=doc.uploaded_at,
        archived_at=doc.archived_at,
    )


async def search_policy_corpus(
    session: AsyncSession,
    query: str,
    top_k: int = 5,
    tau_vector: float = 0.65,
    tau_lexical: float = 0.05,
    vector_weight: float = 0.7,
    text_weight: float = 0.3,
) -> tuple[str, list[RAGSearchResultItem]]:
    """
    Perform hybrid retrieval: pgvector cosine similarity + Postgres full-text search with RRF.

    Signals are absolute-calibrated:
    - Cosine similarity >= tau_vector
    - Lexical rank >= tau_lexical
    - RRF combines relative rank position only among surviving candidates
    - Graceful fallback to lexical_only if embedding generation is unavailable
    """
    query_clean = query.strip()
    if not query_clean:
        return "empty", []

    is_postgres = session.bind is not None and "postgresql" in session.bind.dialect.name

    # Step 1: Compute query embedding
    query_vector: list[float] | None = None
    try:
        query_vector = await embed_query(query_clean)
    except Exception as exc:
        logger.warning(f"Query embedding generation failed, using lexical fallback: {exc}")
        query_vector = None

    # Step 2: Postgres Hybrid Search
    if is_postgres:
        return await _search_postgres(
            session=session,
            query=query_clean,
            query_vector=query_vector,
            top_k=top_k,
            tau_vector=tau_vector,
            tau_lexical=tau_lexical,
            vector_weight=vector_weight,
            text_weight=text_weight,
        )
    else:
        # SQLite fallback for offline unit tests
        return await _search_sqlite(
            session=session,
            query=query_clean,
            query_vector=query_vector,
            top_k=top_k,
            tau_vector=tau_vector,
            tau_lexical=tau_lexical,
        )


async def _search_postgres(
    session: AsyncSession,
    query: str,
    query_vector: list[float] | None,
    top_k: int,
    tau_vector: float,
    tau_lexical: float,
    vector_weight: float,
    text_weight: float,
) -> tuple[str, list[RAGSearchResultItem]]:
    """Execute hybrid vector + full-text search against PostgreSQL."""
    vector_candidates: dict[UUID, dict[str, Any]] = {}
    lexical_candidates: dict[UUID, dict[str, Any]] = {}

    # A. Dense Vector Retrieval
    if query_vector is not None:
        vector_sql = text("""
            SELECT
                c.id, c.document_id, d.title as doc_title, c.section_title,
                c.text, c.checksum_sha256,
                (1.0 - (c.embedding <=> CAST(:query_vec AS vector))) as cosine_sim
            FROM policy_chunks c
            JOIN policy_documents d ON c.document_id = d.id
            WHERE d.status = 'active'
              AND c.embedding IS NOT NULL
              AND (1.0 - (c.embedding <=> CAST(:query_vec AS vector))) >= :tau_v
            ORDER BY cosine_sim DESC
            LIMIT :candidate_k
        """)
        v_res = await session.execute(
            vector_sql,
            {
                "query_vec": str(query_vector),
                "tau_v": tau_vector,
                "candidate_k": top_k * 3,
            },
        )
        for rank_idx, row in enumerate(v_res.mappings().all(), start=1):
            chunk_id = row["id"]
            vector_candidates[chunk_id] = {
                "chunk_id": chunk_id,
                "document_id": row["document_id"],
                "document_title": row["doc_title"],
                "section_title": row["section_title"],
                "text": row["text"],
                "checksum_sha256": row["checksum_sha256"],
                "cosine_sim": float(row["cosine_sim"]),
                "vector_rank": rank_idx,
            }

    # B. Full-Text Search Retrieval (parameterized websearch_to_tsquery)
    lexical_sql = text("""
        SELECT
            c.id, c.document_id, d.title as doc_title, c.section_title,
            c.text, c.checksum_sha256,
            ts_rank_cd(c.tsv, websearch_to_tsquery('english', :q)) as lex_rank
        FROM policy_chunks c
        JOIN policy_documents d ON c.document_id = d.id
        WHERE d.status = 'active'
          AND c.tsv @@ websearch_to_tsquery('english', :q)
          AND ts_rank_cd(c.tsv, websearch_to_tsquery('english', :q)) >= :tau_lex
        ORDER BY lex_rank DESC
        LIMIT :candidate_k
    """)
    l_res = await session.execute(
        lexical_sql,
        {
            "q": query,
            "tau_lex": tau_lexical,
            "candidate_k": top_k * 3,
        },
    )
    for rank_idx, row in enumerate(l_res.mappings().all(), start=1):
        chunk_id = row["id"]
        lexical_candidates[chunk_id] = {
            "chunk_id": chunk_id,
            "document_id": row["document_id"],
            "document_title": row["doc_title"],
            "section_title": row["section_title"],
            "text": row["text"],
            "checksum_sha256": row["checksum_sha256"],
            "lexical_rank": float(row["lex_rank"]),
            "lexical_pos": rank_idx,
        }

    # C. Reciprocal Rank Fusion & Mode Detection
    all_chunk_ids = set(vector_candidates.keys()) | set(lexical_candidates.keys())
    if not all_chunk_ids:
        return "empty", []

    has_vector = len(vector_candidates) > 0
    has_lexical = len(lexical_candidates) > 0

    if has_vector and has_lexical:
        retrieval_mode = "hybrid"
    elif has_vector:
        retrieval_mode = "vector_only"
    else:
        retrieval_mode = "lexical_only"

    scored_items: list[RAGSearchResultItem] = []
    for chunk_id in all_chunk_ids:
        v_data = vector_candidates.get(chunk_id)
        l_data = lexical_candidates.get(chunk_id)
        sample = v_data or l_data
        assert sample is not None

        rrf_score = 0.0
        cos_sim: float | None = None
        lex_rank: float | None = None

        if v_data is not None:
            cos_sim = v_data["cosine_sim"]
            rrf_score += vector_weight * (1.0 / (60.0 + v_data["vector_rank"]))

        if l_data is not None:
            lex_rank = l_data["lexical_rank"]
            rrf_score += text_weight * (1.0 / (60.0 + l_data["lexical_pos"]))

        scored_items.append(
            RAGSearchResultItem(
                chunk_id=chunk_id,
                document_id=sample["document_id"],
                document_title=sample["document_title"],
                section_title=sample["section_title"],
                text=sample["text"],
                checksum_sha256=sample["checksum_sha256"],
                cosine_similarity=round(cos_sim, 4) if cos_sim is not None else None,
                lexical_rank=round(lex_rank, 4) if lex_rank is not None else None,
                rrf_score=round(rrf_score, 6),
                grounded=True,
            )
        )

    # Sort descending by RRF score
    scored_items.sort(key=lambda item: item.rrf_score, reverse=True)
    return retrieval_mode, scored_items[:top_k]


async def _search_sqlite(
    session: AsyncSession,
    query: str,
    query_vector: list[float] | None,
    top_k: int,
    tau_vector: float,
    tau_lexical: float,
) -> tuple[str, list[RAGSearchResultItem]]:
    """Fallback search for SQLite test environments using keyword matching."""
    tokens = [t.lower() for t in query.split() if len(t) >= 3]
    stmt = (
        select(PolicyChunk, PolicyDocument)
        .join(PolicyDocument, PolicyChunk.document_id == PolicyDocument.id)
        .where(PolicyDocument.status == "active")
    )
    res = await session.execute(stmt)
    rows = res.all()

    scored: list[tuple[float, PolicyChunk, PolicyDocument]] = []
    for chunk, doc in rows:
        text_lower = chunk.text.lower()
        score = sum(1.0 for t in tokens if t in text_lower)
        if score > 0:
            scored.append((score, chunk, doc))

    if not scored:
        return "empty", []

    scored.sort(key=lambda s: s[0], reverse=True)
    items: list[RAGSearchResultItem] = []
    for rank_idx, (score, chunk, doc) in enumerate(scored[:top_k], start=1):
        items.append(
            RAGSearchResultItem(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_title=doc.title,
                section_title=chunk.section_title,
                text=chunk.text,
                checksum_sha256=chunk.checksum_sha256,
                lexical_rank=score,
                rrf_score=1.0 / (60.0 + rank_idx),
                grounded=True,
            )
        )
    return "lexical_only", items
