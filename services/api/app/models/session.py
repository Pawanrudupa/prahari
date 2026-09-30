import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class Session(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "sessions"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Action(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "actions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    tool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tools.id"), nullable=False
    )
    args_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_classes: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True
    )
    parent_action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("actions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
