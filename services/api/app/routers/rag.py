"""Policy RAG Router: Ingestion, Chunks, Archival, and Hybrid Semantic Search."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.admin import require_admin_token, require_session_or_admin_token
from app.core.database import get_db
from app.rag.extractor import (
    MAX_FILE_SIZE_BYTES,
    ExtractionError,
)
from app.rag.service import (
    DocumentNotFoundError,
    DuplicateDocumentError,
    archive_policy_document,
    get_document_chunks,
    ingest_policy_document,
    list_policy_documents,
    search_policy_corpus,
)
from app.schemas.rag import (
    PolicyChunkResponse,
    PolicyDocumentResponse,
    RAGSearchRequest,
    RAGSearchResponse,
)

router = APIRouter(prefix="/v1/rag", tags=["policy-rag"])


@router.post(
    "/documents",
    response_model=PolicyDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and ingest a policy document (Markdown or PDF)",
)
async def upload_document(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str | None, Form()] = None,
    _: Annotated[str, Depends(require_admin_token)] = "",
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> PolicyDocumentResponse:
    """
    Ingest a policy document with streaming size verification, sanitization,
    chunking, FastEmbed dense vector generation, and full-text TSVector indexing.
    Enforces a strict 5 MB cap and duplicate SHA-256 detection.
    """
    filename = file.filename or "uploaded_policy.md"
    file_bytes = bytearray()
    chunk_size = 64 * 1024  # 64 KB read buffer

    # Streaming read with 5 MB threshold limit
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        file_bytes.extend(chunk)
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES} bytes (5 MB)",
            )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    doc_title = title.strip() if title and title.strip() else filename

    try:
        doc = await ingest_policy_document(
            session=db,
            title=doc_title,
            filename=filename,
            content=bytes(file_bytes),
        )
    except DuplicateDocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return PolicyDocumentResponse(
        id=doc.id,
        title=doc.title,
        source=doc.source,
        doc_type=doc.doc_type,
        file_size_bytes=doc.file_size_bytes,
        checksum_sha256=doc.checksum_sha256,
        status=doc.status,
        chunk_count=0,
        uploaded_at=doc.uploaded_at,
        archived_at=doc.archived_at,
    )


@router.get(
    "/documents",
    response_model=list[PolicyDocumentResponse],
    summary="List active or archived policy documents",
)
async def get_documents(
    include_archived: Annotated[bool, Query()] = False,
    _: Annotated[dict[str, str], Depends(require_session_or_admin_token)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[PolicyDocumentResponse]:
    """Retrieve all ingested policy documents with their current status and chunk counts."""
    return await list_policy_documents(session=db, include_archived=include_archived)


@router.get(
    "/documents/{document_id}/chunks",
    response_model=list[PolicyChunkResponse],
    summary="Get all chunks for a specific policy document",
)
async def get_chunks_for_document(
    document_id: UUID,
    _: Annotated[dict[str, str], Depends(require_session_or_admin_token)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[PolicyChunkResponse]:
    """Return sequential text chunks, headings, and metadata for a policy document."""
    try:
        return await get_document_chunks(session=db, document_id=document_id)
    except DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/documents/{document_id}/archive",
    response_model=PolicyDocumentResponse,
    summary="Soft-archive a policy document",
)
async def archive_document(
    document_id: UUID,
    _: Annotated[str, Depends(require_admin_token)] = "",
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> PolicyDocumentResponse:
    """
    Soft-archive a policy document. Preserves chunks and audit trail integrity.
    Archived documents are excluded from active RAG retrieval.
    """
    try:
        return await archive_policy_document(session=db, document_id=document_id)
    except DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/search",
    response_model=RAGSearchResponse,
    summary="Perform hybrid semantic retrieval over active policy documents",
)
async def search_corpus(
    request: RAGSearchRequest,
    _: Annotated[dict[str, str], Depends(require_session_or_admin_token)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> RAGSearchResponse:
    """
    Hybrid semantic retrieval combining pgvector dense cosine similarity with
    PostgreSQL tsvector full-text search and Reciprocal Rank Fusion (RRF).
    Filters candidates by absolute thresholds (tau_vector and tau_lexical).
    """
    retrieval_mode, results = await search_policy_corpus(
        session=db,
        query=request.query,
        top_k=request.top_k,
        tau_vector=request.tau_vector,
        tau_lexical=request.tau_lexical,
        vector_weight=request.vector_weight,
        text_weight=request.text_weight,
    )

    return RAGSearchResponse(
        query=request.query,
        retrieval_mode=retrieval_mode,
        total_matches=len(results),
        results=results,
    )
