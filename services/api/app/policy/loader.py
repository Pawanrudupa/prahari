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

    if policy.defaults.decision.lower() != "deny":
        errors.append(
            "Policy defaults.decision must strictly be 'deny' to ensure fail-closed governance; "
            f"'{policy.defaults.decision}' is forbidden"
        )

    seen_ids: set[str] = set()
    for rule in policy.rules:
        if rule.id in seen_ids:
            errors.append(f"Duplicate rule id '{rule.id}'")
        seen_ids.add(rule.id)

        if rule.effect == "redact" and (not rule.redact or len(rule.redact) == 0):
            errors.append(
                f"Rule '{rule.id}' with effect 'redact' must specify non-empty 'redact' list"
            )

        if rule.sources:
            for s_idx, src in enumerate(rule.sources):
                if not src.document.strip():
                    errors.append(f"Rule '{rule.id}' source #{s_idx + 1} has empty document")
                if not src.section.strip():
                    errors.append(f"Rule '{rule.id}' source #{s_idx + 1} has empty section")

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


async def validate_policy_declared_sources(
    session: Any, policy: PolicyDefinition
) -> dict[str, Any]:
    """Validate declared sources against the policy documents/chunks in the database.

    Returns:
        {
            "is_valid": bool,
            "warnings": list[str],
            "rules_with_sources": list[str],
            "rules_without_sources": list[str],
        }
    """
    from sqlalchemy import select

    from app.models.policy import PolicyChunk, PolicyDocument

    warnings: list[str] = []
    rules_with_sources: list[str] = []
    rules_without_sources: list[str] = []

    # Pre-fetch all documents
    doc_res = await session.execute(select(PolicyDocument))
    docs = doc_res.scalars().all()
    doc_by_title = {d.title.lower().strip(): d for d in docs}
    doc_by_source = {d.source.lower().strip(): d for d in docs if d.source}

    for rule in policy.rules:
        if not rule.sources:
            rules_without_sources.append(rule.id)
            continue

        rules_with_sources.append(rule.id)
        for src in rule.sources:
            src_doc_key = src.document.lower().strip()
            matched_doc = doc_by_source.get(src_doc_key) or doc_by_title.get(src_doc_key)

            if matched_doc is None:
                warnings.append(f"Rule '{rule.id}' cites missing document '{src.document}'")
                continue

            if matched_doc.status == "archived":
                warnings.append(f"Rule '{rule.id}' cites archived document '{matched_doc.title}'")

            # Check chunk section
            target_sec = (src.section_id or src.section).lower().strip()
            chunk_stmt = select(PolicyChunk).where(PolicyChunk.document_id == matched_doc.id)
            c_res = await session.execute(chunk_stmt)
            chunks = c_res.scalars().all()

            found_chunk = False
            for c in chunks:
                if c.section_id and c.section_id.lower().strip() == target_sec:
                    found_chunk = True
                    break
                if c.section_title and target_sec in c.section_title.lower():
                    found_chunk = True
                    break

            if not found_chunk:
                warnings.append(
                    f"Rule '{rule.id}' cites section '{src.section}' "
                    f"not found in document '{matched_doc.title}'"
                )

    return {
        "is_valid": len(warnings) == 0,
        "warnings": warnings,
        "rules_with_sources": rules_with_sources,
        "rules_without_sources": rules_without_sources,
    }
