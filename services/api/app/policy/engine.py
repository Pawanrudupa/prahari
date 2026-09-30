"""Deterministic policy evaluation engine with strict precedence."""

import fnmatch
from typing import Any

from app.policy.schemas import (
    EvaluationContext,
    PolicyDecision,
    PolicyDefinition,
    PolicyRule,
)


def _match_agent(rule: PolicyRule, ctx: EvaluationContext) -> bool:
    """Check if the rule's agent criteria match the evaluation context."""
    if rule.agent is None:
        return True

    if rule.agent.role is not None and (
        not ctx.agent_role or ctx.agent_role.lower() != rule.agent.role.lower()
    ):
        return False

    if rule.agent.id is not None and (not ctx.agent_id or str(ctx.agent_id) != rule.agent.id):
        return False

    if rule.agent.name is not None:
        return bool(ctx.agent_name and ctx.agent_name.lower() == rule.agent.name.lower())

    return True


def _match_tool(rule: PolicyRule, tool_name: str) -> bool:
    """Check if the rule's tool pattern matches the called tool."""
    if rule.tool is None:
        return True
    return fnmatch.fnmatch(tool_name, rule.tool)


def _extract_rows_count(args: dict[str, Any], explicit_count: int | None) -> int | None:
    """Extract row count from explicit context or inspect common argument keys."""
    if explicit_count is not None:
        return explicit_count
    for key in ("rows", "row_count", "limit", "count"):
        val = args.get(key)
        if isinstance(val, int):
            return val
    items = args.get("items") or args.get("records")
    if isinstance(items, list):
        return len(items)
    return None


def _match_when(rule: PolicyRule, ctx: EvaluationContext) -> bool:
    """Check if the rule's when conditions match the evaluation context."""
    if rule.when is None:
        return True

    when = rule.when

    # 1. data_classes_any: match if any required class is in context data_classes
    if when.data_classes_any is not None:
        required_classes = {c.lower() for c in when.data_classes_any}
        present_classes = {c.lower() for c in ctx.data_classes}
        if not required_classes.intersection(present_classes):
            return False

    # 2. rows_gt: match if rows count exceeds threshold
    if when.rows_gt is not None:
        count = _extract_rows_count(ctx.args, ctx.rows_count)
        if count is None or count <= when.rows_gt:
            return False

    # 3. injection_score_gte: match if injection score reaches or exceeds threshold
    if when.injection_score_gte is not None:
        return ctx.injection_score >= when.injection_score_gte

    return True


def _matches_rule(rule: PolicyRule, ctx: EvaluationContext) -> bool:
    """Determine whether a policy rule applies to the given context."""
    return _match_agent(rule, ctx) and _match_tool(rule, ctx.tool) and _match_when(rule, ctx)


def evaluate_policy(policy: PolicyDefinition, ctx: EvaluationContext) -> PolicyDecision:
    """
    Evaluate policy rules against the action context with deterministic precedence:
    deny > escalate > redact > allow > default deny

    Every decision carries the matched rule_id (or None for default) and policy_version.
    """
    matching_deny: list[PolicyRule] = []
    matching_escalate: list[PolicyRule] = []
    matching_redact: list[PolicyRule] = []
    matching_allow: list[PolicyRule] = []

    for rule in policy.rules:
        if _matches_rule(rule, ctx):
            if rule.effect == "deny":
                matching_deny.append(rule)
            elif rule.effect == "escalate":
                matching_escalate.append(rule)
            elif rule.effect == "redact":
                matching_redact.append(rule)
            elif rule.effect == "allow":
                matching_allow.append(rule)

    # 1. Highest precedence: DENY
    if matching_deny:
        rule = matching_deny[0]
        return PolicyDecision(
            outcome="deny",
            rule_id=rule.id,
            policy_version=policy.version,
            reason=f"Denied by policy rule '{rule.id}'",
        )

    # 2. Second precedence: ESCALATE
    if matching_escalate:
        rule = matching_escalate[0]
        return PolicyDecision(
            outcome="escalate",
            rule_id=rule.id,
            policy_version=policy.version,
            reason=f"Escalated for human approval by rule '{rule.id}'",
        )

    # 3. Third precedence: REDACT
    if matching_redact:
        rule = matching_redact[0]
        # Aggregate all redaction fields across all matching redact rules
        all_redact_fields: set[str] = set()
        for r in matching_redact:
            if r.redact:
                all_redact_fields.update(r.redact)
        return PolicyDecision(
            outcome="redact",
            rule_id=rule.id,
            policy_version=policy.version,
            reason=f"Redacted by policy rule '{rule.id}'",
            redacted_fields=sorted(all_redact_fields),
        )

    # 4. Fourth precedence: ALLOW
    if matching_allow:
        rule = matching_allow[0]
        return PolicyDecision(
            outcome="allow",
            rule_id=rule.id,
            policy_version=policy.version,
            reason=f"Allowed by policy rule '{rule.id}'",
        )

    # 5. Fallback: Default Decision (default deny)
    return PolicyDecision(
        outcome=policy.defaults.decision,
        rule_id=None,
        policy_version=policy.version,
        reason="default_deny"
        if policy.defaults.decision == "deny"
        else f"default_{policy.defaults.decision}",
    )
