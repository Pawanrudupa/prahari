"""Pydantic schemas for the Prahari Policy DSL."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Effect = Literal["allow", "deny", "redact", "escalate"]


class AgentMatcher(BaseModel):
    """Matches an agent by role, id, or name."""

    role: str | None = None
    id: str | None = None
    name: str | None = None

    model_config = ConfigDict(extra="forbid")


class RuleWhen(BaseModel):
    """Conditional operators for policy rules."""

    data_classes_any: list[str] | None = None
    rows_gt: int | None = None
    injection_score_gte: float | None = None

    model_config = ConfigDict(extra="forbid")


class PolicyRule(BaseModel):
    """A single rule in a policy."""

    id: str
    effect: Effect
    agent: AgentMatcher | None = None
    tool: str | None = None
    when: RuleWhen | None = None
    redact: list[str] | None = None

    model_config = ConfigDict(extra="forbid")


class PolicyDefaults(BaseModel):
    """Default policy behavior when no rules match."""

    decision: Effect = "deny"

    model_config = ConfigDict(extra="forbid")


class PolicyLimit(BaseModel):
    """Usage and loop limits defined in a policy."""

    id: str
    per: Literal["agent"] = "agent"
    max_calls_per_min: int | None = None
    max_repeat_same_call: int | None = None
    max_spend_inr_per_day: float | None = None

    model_config = ConfigDict(extra="forbid")


class PolicyDefinition(BaseModel):
    """Validated policy document parsed from YAML DSL."""

    policy: str
    version: int
    defaults: PolicyDefaults = Field(default_factory=PolicyDefaults)
    rules: list[PolicyRule] = Field(default_factory=list)
    limits: list[PolicyLimit] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class EvaluationContext(BaseModel):
    """Context provided to the policy evaluation engine."""

    agent_id: UUID | str | None = None
    agent_role: str | None = None
    agent_name: str | None = None
    tool: str = ""
    args: dict[str, Any] = Field(default_factory=dict)
    data_classes: list[str] = Field(default_factory=list)
    rows_count: int | None = None
    injection_score: float = 0.0

    model_config = ConfigDict(arbitrary_types_allowed=True)


class PolicyDecision(BaseModel):
    """Result of evaluating a policy against an action."""

    outcome: Effect
    rule_id: str | None = None
    policy_version: int
    reason: str
    redacted_fields: list[str] = Field(default_factory=list)
