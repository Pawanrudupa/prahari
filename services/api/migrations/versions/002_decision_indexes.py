"""Add performance indexes for decisions and audit queries

Revision ID: 002
Revises: 001
Create Date: 2026-10-19
"""

from collections.abc import Sequence

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Indexes on decisions table
    op.create_index(
        "ix_decisions_created_at",
        "decisions",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_decisions_outcome",
        "decisions",
        ["outcome"],
        unique=False,
    )
    op.create_index(
        "ix_decisions_rule_id",
        "decisions",
        ["rule_id"],
        unique=False,
    )
    op.create_index(
        "ix_decisions_action_id",
        "decisions",
        ["action_id"],
        unique=False,
    )

    # 2. Indexes on audit_log table
    op.create_index(
        "ix_audit_log_created_at",
        "audit_log",
        ["created_at"],
        unique=False,
    )

    # Expression index on payload_json->>'outcome' for PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_log_payload_outcome "
            "ON audit_log ((payload_json->>'outcome'))"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_log_payload_agent_id "
            "ON audit_log ((payload_json->>'agent_id'))"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_log_payload_tool "
            "ON audit_log ((payload_json->>'tool'))"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_log_payload_rule_id "
            "ON audit_log ((payload_json->>'rule_id'))"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_audit_log_payload_rule_id")
        op.execute("DROP INDEX IF EXISTS ix_audit_log_payload_tool")
        op.execute("DROP INDEX IF EXISTS ix_audit_log_payload_agent_id")
        op.execute("DROP INDEX IF EXISTS ix_audit_log_payload_outcome")

    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
    op.drop_index("ix_decisions_action_id", table_name="decisions")
    op.drop_index("ix_decisions_rule_id", table_name="decisions")
    op.drop_index("ix_decisions_outcome", table_name="decisions")
    op.drop_index("ix_decisions_created_at", table_name="decisions")
