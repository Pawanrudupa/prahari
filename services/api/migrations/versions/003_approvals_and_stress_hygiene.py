"""Add approval security token columns, agent/tool tags, and stress hygiene

Revision ID: 003
Revises: 002
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Agents: add tags column
    op.add_column(
        "agents",
        sa.Column("tags", JSONB, nullable=False, server_default="[]"),
    )

    # 2. Tools: add status and tags columns
    op.add_column(
        "tools",
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
    )
    op.add_column(
        "tools",
        sa.Column("tags", JSONB, nullable=False, server_default="[]"),
    )

    # 3. Approvals: add token and governance metadata columns
    op.add_column(
        "approvals",
        sa.Column("token_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "approvals",
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "approvals",
        sa.Column("token_consumed", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "approvals",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        "approvals",
        sa.Column(
            "agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
        ),
    )
    op.add_column(
        "approvals",
        sa.Column(
            "tool_id", sa.Uuid(), sa.ForeignKey("tools.id", ondelete="CASCADE"), nullable=True
        ),
    )
    op.add_column(
        "approvals",
        sa.Column("args_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "approvals",
        sa.Column("risk_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "approvals",
        sa.Column("rule_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "approvals",
        sa.Column("reason", sa.Text(), nullable=True),
    )

    # Index for approval tokens and status lookup
    op.create_index(
        "ix_approvals_token_hash",
        "approvals",
        ["token_hash"],
        unique=False,
    )
    op.create_index(
        "ix_approvals_status",
        "approvals",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_approvals_status", table_name="approvals")
    op.drop_index("ix_approvals_token_hash", table_name="approvals")
    op.drop_column("approvals", "reason")
    op.drop_column("approvals", "rule_id")
    op.drop_column("approvals", "risk_score")
    op.drop_column("approvals", "args_hash")
    op.drop_column("approvals", "tool_id")
    op.drop_column("approvals", "agent_id")
    op.drop_column("approvals", "created_at")
    op.drop_column("approvals", "token_consumed")
    op.drop_column("approvals", "token_expires_at")
    op.drop_column("approvals", "token_hash")
    op.drop_column("tools", "tags")
    op.drop_column("tools", "status")
    op.drop_column("agents", "tags")
