"""YAML loader and validator for the Prahari Policy DSL."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.policy.schemas import PolicyDefinition


class PolicyValidationError(Exception):
    """Raised when a policy document fails structural or logical validation."""

    def __init__(self, message: str, details: list[str] | None = None) -> None:
        self.message = message
        self.details = details or []
        formatted = f"{message}: {'; '.join(self.details)}" if self.details else message
        super().__init__(formatted)


def validate_policy_logic(policy: PolicyDefinition) -> None:
    """Perform semantic validation beyond basic schema parsing."""
    errors: list[str] = []

    if not policy.policy.strip():
        errors.append("Policy name must not be empty")

    if policy.version <= 0:
        errors.append(f"Policy version must be positive integer, got {policy.version}")

    seen_ids: set[str] = set()
    for rule in policy.rules:
        if rule.id in seen_ids:
            errors.append(f"Duplicate rule id '{rule.id}'")
        seen_ids.add(rule.id)

        if rule.effect == "redact" and (not rule.redact or len(rule.redact) == 0):
            errors.append(
                f"Rule '{rule.id}' with effect 'redact' must specify non-empty 'redact' list"
            )

    seen_limit_ids: set[str] = set()
    for limit in policy.limits:
        if limit.id in seen_limit_ids:
            errors.append(f"Duplicate limit id '{limit.id}'")
        seen_limit_ids.add(limit.id)

        if limit.max_calls_per_min is not None and limit.max_calls_per_min <= 0:
            errors.append(f"Limit '{limit.id}' max_calls_per_min must be positive")
        if limit.max_repeat_same_call is not None and limit.max_repeat_same_call <= 0:
            errors.append(f"Limit '{limit.id}' max_repeat_same_call must be positive")
        if limit.max_spend_inr_per_day is not None and limit.max_spend_inr_per_day < 0:
            errors.append(f"Limit '{limit.id}' max_spend_inr_per_day cannot be negative")

    if errors:
        raise PolicyValidationError("Policy semantic validation failed", details=errors)


def load_policy_from_yaml(yaml_content: str) -> PolicyDefinition:
    """Parse and validate YAML policy string."""
    try:
        raw_data: Any = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise PolicyValidationError(f"Invalid YAML syntax: {exc}") from exc

    if not isinstance(raw_data, dict):
        raise PolicyValidationError("Policy YAML root must be a mapping/dictionary")

    try:
        policy = PolicyDefinition.model_validate(raw_data)
    except ValidationError as exc:
        details = [f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()]
        raise PolicyValidationError("Policy schema validation failed", details=details) from exc

    validate_policy_logic(policy)
    return policy


def load_policy_from_file(path: str | Path) -> PolicyDefinition:
    """Read a policy YAML file from disk and validate it."""
    file_path = Path(path)
    if not file_path.is_file():
        raise PolicyValidationError(f"Policy file not found: {file_path}")

    content = file_path.read_text(encoding="utf-8")
    return load_policy_from_yaml(content)
