"""Request and response schemas for the Prahari Gateway API."""

from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class ToolCallRequest(BaseModel):
    """Payload sent by an agent SDK or proxy to evaluate a tool call."""

    agent_key: str = Field(..., description="Agent API key for identity authentication")
    session_id: UUID = Field(..., description="Agent session ID")
    tool: str = Field(..., description="Full tool name (e.g. crm.read_ticket)")
    args: dict[str, Any] = Field(default_factory=dict, description="Arguments to pass to the tool")
    purpose: str | None = Field(default=None, description="Declared purpose for the tool call")
    context: dict[str, Any] | None = Field(
        default=None, description="Attached conversation or prior tool outputs"
    )

    model_config = ConfigDict(extra="forbid")


class ToolCallResponse(BaseModel):
    """Decision returned to the agent proxy."""

    decision: Literal["allow", "deny", "redact", "escalate"]
    rule_id: str | None = None
    reason: str
    redacted_args: dict[str, Any] | None = None
    approval_id: UUID | None = None
    decision_id: UUID = Field(default_factory=uuid4)
    data_classes: list[str] = Field(default_factory=list)
