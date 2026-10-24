"""Add hybrid search columns and document lifecycle metadata for Policy RAG

Revision ID: 004
Revises: 003
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TSVECTOR

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Update policy_documents
    op.add_column(
        "policy_documents",
        sa.Column("doc_type", sa.String(50), nullable=False, server_default="markdown"),
    )
    op.add_column(
        "policy_documents",
        sa.Column("file_size_bytes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "policy_documents",
        sa.Column("checksum_sha256", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "policy_documents",
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
    )
    op.add_column(
        "policy_documents",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_policy_documents_status", "policy_documents", ["status"])
    op.create_index(
        "idx_policy_documents_checksum",
        "policy_documents",
        ["checksum_sha256"],
        unique=False,
    )

    # 2. Update policy_chunks
    op.add_column(
        "policy_chunks",
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "policy_chunks",
        sa.Column("section_title", sa.String(500), nullable=True),
    )
    op.add_column(
        "policy_chunks",
        sa.Column("checksum_sha256", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "policy_chunks",
        sa.Column("tsv", TSVECTOR, nullable=True),
    )
    op.create_index(
        "idx_policy_chunks_doc_chunk",
        "policy_chunks",
        ["document_id", "chunk_index"],
    )
    op.create_index(
        "idx_policy_chunks_tsv",
        "policy_chunks",
        ["tsv"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("idx_policy_chunks_tsv", table_name="policy_chunks")
    op.drop_index("idx_policy_chunks_doc_chunk", table_name="policy_chunks")
    op.drop_column("policy_chunks", "tsv")
    op.drop_column("policy_chunks", "checksum_sha256")
    op.drop_column("policy_chunks", "section_title")
    op.drop_column("policy_chunks", "chunk_index")

    op.drop_index("idx_policy_documents_checksum", table_name="policy_documents")
    op.drop_index("idx_policy_documents_status", table_name="policy_documents")
    op.drop_column("policy_documents", "archived_at")
    op.drop_column("policy_documents", "status")
    op.drop_column("policy_documents", "checksum_sha256")
    op.drop_column("policy_documents", "file_size_bytes")
    op.drop_column("policy_documents", "doc_type")
