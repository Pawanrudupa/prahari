import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class Budget(Base):
    __tablename__ = "budgets"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
    )
    window: Mapped[str] = mapped_column(String(50), primary_key=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_spend: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_calls: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Incident(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "incidents"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RedteamRun(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "redteam_runs"

    scenario: Mapped[str] = mapped_column(String(255), nullable=False)
    owasp_ids: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
