from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Tool(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tools"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    server: Mapped[str] = mapped_column(String(255), nullable=False)
    schema_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    sensitivity: Mapped[str | None] = mapped_column(String(50), nullable=True)
