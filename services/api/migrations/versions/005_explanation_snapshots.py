"""Add explanation_snapshots table with DB-level immutability and section_id on chunks

Revision ID: 005
Revises: 004
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add section_id to policy_chunks
    op.add_column(
        "policy_chunks",
        sa.Column("section_id", sa.String(50), nullable=True),
    )
    op.create_index(
        "idx_policy_chunks_section_id",
        "policy_chunks",
        ["section_id"],
    )

    # 2. Create explanation_snapshots table
    op.create_table(
        "explanation_snapshots",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "decision_id",
            sa.UUID(),
            sa.ForeignKey("decisions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "policy_version_id",
            sa.UUID(),
            sa.ForeignKey("policy_versions.id"),
            nullable=True,
        ),
        sa.Column("corpus_hash", sa.String(64), nullable=False),
        sa.Column(
            "explainer_version",
            sa.String(50),
            nullable=False,
            server_default="v1.0-offline",
        ),
        sa.Column("snapshot_sha256", sa.String(64), nullable=False),
        sa.Column("grounded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("why", JSONB(), nullable=False),
        sa.Column("declared_sources", JSONB(), nullable=False, server_default="[]"),
        sa.Column("suggested_sources", JSONB(), nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_explanation_snapshots_decision_id",
        "explanation_snapshots",
        ["decision_id"],
    )
    op.create_index(
        "idx_explanation_snapshots_policy_version",
        "explanation_snapshots",
        ["policy_version_id"],
    )
    op.create_index(
        "idx_explanation_snapshots_corpus_hash",
        "explanation_snapshots",
        ["corpus_hash"],
    )

    # 3. DB-level Immutability Trigger (PostgreSQL)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("""
            CREATE OR REPLACE FUNCTION prevent_explanation_snapshot_update()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'explanation_snapshots table is immutable; updates are forbidden';
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute(
            "DROP TRIGGER IF EXISTS trg_no_update_explanation_snapshots ON explanation_snapshots;"
        )
        op.execute("""
            CREATE TRIGGER trg_no_update_explanation_snapshots
            BEFORE UPDATE ON explanation_snapshots
            FOR EACH ROW EXECUTE FUNCTION prevent_explanation_snapshot_update();
        """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS trg_no_update_explanation_snapshots ON explanation_snapshots;"
        )
        op.execute("DROP FUNCTION IF EXISTS prevent_explanation_snapshot_update();")

    op.drop_table("explanation_snapshots")
    op.drop_index("idx_policy_chunks_section_id", table_name="policy_chunks")
    op.drop_column("policy_chunks", "section_id")
