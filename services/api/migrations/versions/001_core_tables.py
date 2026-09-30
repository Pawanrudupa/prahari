"""Core tables

Revision ID: 001
Revises: None
Create Date: 2026-09-30

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "agents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("owner", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=True),
        sa.Column("api_key_prefix", sa.String(32), index=True, nullable=False),
        sa.Column("api_key_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "tools",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("server", sa.String(255), nullable=False),
        sa.Column("schema_json", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("sensitivity", sa.String(50), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "agent_tool_grants",
        sa.Column(
            "agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "tool_id", sa.Uuid(), sa.ForeignKey("tools.id", ondelete="CASCADE"), primary_key=True
        ),
    )

    op.create_table(
        "policies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("active_version_id", sa.Uuid(), nullable=True),
        # FK to policy_versions added after that table is created
    )

    op.create_table(
        "policy_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "policy_id", sa.Uuid(), sa.ForeignKey("policies.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("yaml", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    # Add FK from policies.active_version_id to policy_versions.id
    op.create_foreign_key(
        "fk_policies_active_version",
        "policies",
        "policy_versions",
        ["active_version_id"],
        ["id"],
    )

    op.create_table(
        "policy_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "policy_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("policy_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("meta", sa.dialects.postgresql.JSONB(), nullable=True),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Uuid(),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("tool_id", sa.Uuid(), sa.ForeignKey("tools.id"), nullable=False),
        sa.Column("args_json", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("data_classes", sa.dialects.postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("parent_action_id", sa.Uuid(), sa.ForeignKey("actions.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "decisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "action_id", sa.Uuid(), sa.ForeignKey("actions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("rule_id", sa.String(100), nullable=True),
        sa.Column(
            "policy_version_id", sa.Uuid(), sa.ForeignKey("policy_versions.id"), nullable=True
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("injection_score", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "approvals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "decision_id",
            sa.Uuid(),
            sa.ForeignKey("decisions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("approver", sa.String(255), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )

    op.create_table(
        "incidents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Uuid(),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column(
            "opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("seq", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("prev_hash", sa.Text(), nullable=False),
        sa.Column("hash", sa.Text(), nullable=False),
        sa.Column("payload_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "budgets",
        sa.Column(
            "agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("window", sa.String(50), primary_key=True),
        sa.Column("max_tokens", sa.Integer(), nullable=True),
        sa.Column("max_spend", sa.Float(), nullable=True),
        sa.Column("max_calls", sa.Integer(), nullable=True),
    )

    op.create_table(
        "redteam_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("scenario", sa.String(255), nullable=False),
        sa.Column("owasp_ids", sa.dialects.postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("redteam_runs")
    op.drop_table("budgets")
    op.drop_table("audit_log")
    op.drop_table("incidents")
    op.drop_table("approvals")
    op.drop_table("decisions")
    op.drop_table("actions")
    op.drop_table("sessions")
    op.drop_table("policy_chunks")
    op.drop_table("policy_documents")
    op.drop_constraint("fk_policies_active_version", "policies", type_="foreignkey")
    op.drop_table("policy_versions")
    op.drop_table("policies")
    op.drop_table("agent_tool_grants")
    op.drop_table("tools")
    op.drop_table("agents")
    op.execute("DROP EXTENSION IF EXISTS vector")
