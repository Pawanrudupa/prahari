"""Table-driven unit tests for the Prahari deterministic policy engine."""

import pytest

from app.policy.engine import evaluate_policy
from app.policy.loader import PolicyValidationError, load_policy_from_yaml
from app.policy.schemas import (
    AgentMatcher,
    EvaluationContext,
    PolicyDefaults,
    PolicyDefinition,
    PolicyRule,
)

# Reference sample policy for table-driven testing
TEST_POLICY_YAML = """
policy: comprehensive-test-guard
version: 1
defaults:
  decision: deny
rules:
  - id: R1-allow-support-crm
    effect: allow
    agent:
      role: support
    tool: crm.read_ticket

  - id: R2-deny-direct-db-restart
    effect: deny
    tool: db.restart

  - id: R3-redact-customer-pii
    effect: redact
    tool: email.send
    when:
      data_classes_any: [aadhaar, pan, phone, email]
    redact: [aadhaar, pan, phone, email]

  - id: R4-escalate-bulk-export
    effect: escalate
    tool: crm.export
    when:
      rows_gt: 100

  - id: R5-deny-high-injection
    effect: deny
    when:
      injection_score_gte: 0.8

  - id: R6-wildcard-analytics
    effect: allow
    tool: "analytics.*"

  - id: R7-conflict-allow-export
    effect: allow
    tool: crm.export

  - id: R8-conflict-redact-export
    effect: redact
    tool: crm.export
    when:
      data_classes_any: [ssn]
    redact: [ssn]

  - id: R9-conflict-deny-export-when-sensitive
    effect: deny
    tool: crm.export
    when:
      data_classes_any: [biometric]
"""


@pytest.fixture
def test_policy() -> PolicyDefinition:
    return load_policy_from_yaml(TEST_POLICY_YAML)


class PolicyTestCase:
    def __init__(
        self,
        name: str,
        ctx: EvaluationContext,
        expected_outcome: str,
        expected_rule_id: str | None,
        expected_reason_substr: str,
        expected_redacted: list[str] | None = None,
    ) -> None:
        self.name = name
        self.ctx = ctx
        self.expected_outcome = expected_outcome
        self.expected_rule_id = expected_rule_id
        self.expected_reason_substr = expected_reason_substr
        self.expected_redacted = expected_redacted or []


TEST_CASES = [
    # 1. Direct tool match with allow
    PolicyTestCase(
        name="allow_support_agent_crm_read",
        ctx=EvaluationContext(agent_role="support", tool="crm.read_ticket"),
        expected_outcome="allow",
        expected_rule_id="R1-allow-support-crm",
        expected_reason_substr="R1-allow-support-crm",
    ),
    # 2. Agent role mismatch -> default deny
    PolicyTestCase(
        name="role_mismatch_falls_to_default_deny",
        ctx=EvaluationContext(agent_role="finance", tool="crm.read_ticket"),
        expected_outcome="deny",
        expected_rule_id=None,
        expected_reason_substr="default_deny",
    ),
    # 3. Direct tool match with explicit deny
    PolicyTestCase(
        name="explicit_deny_db_restart",
        ctx=EvaluationContext(agent_role="devops", tool="db.restart"),
        expected_outcome="deny",
        expected_rule_id="R2-deny-direct-db-restart",
        expected_reason_substr="R2-deny-direct-db-restart",
    ),
    # 4. Redaction trigger with aadhaar
    PolicyTestCase(
        name="redact_on_aadhaar",
        ctx=EvaluationContext(tool="email.send", data_classes=["aadhaar"]),
        expected_outcome="redact",
        expected_rule_id="R3-redact-customer-pii",
        expected_reason_substr="R3-redact-customer-pii",
        expected_redacted=["aadhaar", "email", "pan", "phone"],
    ),
    # 5. Redaction trigger with PAN
    PolicyTestCase(
        name="redact_on_pan",
        ctx=EvaluationContext(tool="email.send", data_classes=["pan"]),
        expected_outcome="redact",
        expected_rule_id="R3-redact-customer-pii",
        expected_reason_substr="R3-redact-customer-pii",
        expected_redacted=["aadhaar", "email", "pan", "phone"],
    ),
    # 6. Redaction trigger with phone
    PolicyTestCase(
        name="redact_on_phone",
        ctx=EvaluationContext(tool="email.send", data_classes=["phone"]),
        expected_outcome="redact",
        expected_rule_id="R3-redact-customer-pii",
        expected_reason_substr="R3-redact-customer-pii",
        expected_redacted=["aadhaar", "email", "pan", "phone"],
    ),
    # 7. Redaction condition unsatisfied -> default deny
    PolicyTestCase(
        name="no_pii_no_rule_match_email",
        ctx=EvaluationContext(tool="email.send", data_classes=["public_info"]),
        expected_outcome="deny",
        expected_rule_id=None,
        expected_reason_substr="default_deny",
    ),
    # 8. Escalate trigger when rows_gt 100
    PolicyTestCase(
        name="escalate_bulk_export_above_threshold",
        ctx=EvaluationContext(tool="crm.export", rows_count=150),
        expected_outcome="escalate",
        expected_rule_id="R4-escalate-bulk-export",
        expected_reason_substr="R4-escalate-bulk-export",
    ),
    # 9. rows_gt threshold not exceeded -> R7 allow applies
    PolicyTestCase(
        name="export_below_threshold_allowed",
        ctx=EvaluationContext(tool="crm.export", rows_count=50),
        expected_outcome="allow",
        expected_rule_id="R7-conflict-allow-export",
        expected_reason_substr="R7-conflict-allow-export",
    ),
    # 10. rows_gt inspected from args['rows']
    PolicyTestCase(
        name="export_rows_inspected_from_args",
        ctx=EvaluationContext(tool="crm.export", args={"rows": 200}),
        expected_outcome="escalate",
        expected_rule_id="R4-escalate-bulk-export",
        expected_reason_substr="R4-escalate-bulk-export",
    ),
    # 11. High injection score triggers deny
    PolicyTestCase(
        name="deny_on_high_injection_score",
        ctx=EvaluationContext(tool="any.tool", injection_score=0.9),
        expected_outcome="deny",
        expected_rule_id="R5-deny-high-injection",
        expected_reason_substr="R5-deny-high-injection",
    ),
    # 12. Injection score below threshold does not match R5
    PolicyTestCase(
        name="low_injection_score_does_not_deny",
        ctx=EvaluationContext(tool="any.tool", injection_score=0.5),
        expected_outcome="deny",
        expected_rule_id=None,
        expected_reason_substr="default_deny",
    ),
    # 13. Wildcard tool pattern matching
    PolicyTestCase(
        name="wildcard_analytics_query",
        ctx=EvaluationContext(tool="analytics.query"),
        expected_outcome="allow",
        expected_rule_id="R6-wildcard-analytics",
        expected_reason_substr="R6-wildcard-analytics",
    ),
    # 14. Wildcard tool pattern matching another endpoint
    PolicyTestCase(
        name="wildcard_analytics_export",
        ctx=EvaluationContext(tool="analytics.export_metrics"),
        expected_outcome="allow",
        expected_rule_id="R6-wildcard-analytics",
        expected_reason_substr="R6-wildcard-analytics",
    ),
    # 15. Wildcard tool mismatch -> default deny
    PolicyTestCase(
        name="wildcard_mismatch_payments",
        ctx=EvaluationContext(tool="payments.transfer"),
        expected_outcome="deny",
        expected_rule_id=None,
        expected_reason_substr="default_deny",
    ),
    # 16. Precedence: Deny beats Escalate and Allow
    PolicyTestCase(
        name="precedence_deny_beats_escalate_and_allow",
        ctx=EvaluationContext(
            tool="crm.export",
            rows_count=200,  # Matches R4 escalate and R7 allow
            data_classes=["biometric"],  # Matches R9 deny
        ),
        expected_outcome="deny",
        expected_rule_id="R9-conflict-deny-export-when-sensitive",
        expected_reason_substr="R9-conflict-deny-export-when-sensitive",
    ),
    # 17. Precedence: Escalate beats Allow
    PolicyTestCase(
        name="precedence_escalate_beats_allow",
        ctx=EvaluationContext(
            tool="crm.export",
            rows_count=150,  # Matches R4 escalate and R7 allow
        ),
        expected_outcome="escalate",
        expected_rule_id="R4-escalate-bulk-export",
        expected_reason_substr="R4-escalate-bulk-export",
    ),
    # 18. Precedence: Redact beats Allow
    PolicyTestCase(
        name="precedence_redact_beats_allow",
        ctx=EvaluationContext(
            tool="crm.export",
            rows_count=50,  # Does not match R4 escalate
            data_classes=["ssn"],  # Matches R8 redact
        ),
        expected_outcome="redact",
        expected_rule_id="R8-conflict-redact-export",
        expected_reason_substr="R8-conflict-redact-export",
        expected_redacted=["ssn"],
    ),
    # 19. Case insensitivity in agent role matching
    PolicyTestCase(
        name="role_case_insensitivity",
        ctx=EvaluationContext(agent_role="SUPPORT", tool="crm.read_ticket"),
        expected_outcome="allow",
        expected_rule_id="R1-allow-support-crm",
        expected_reason_substr="R1-allow-support-crm",
    ),
    # 20. Default deny on completely unknown tool
    PolicyTestCase(
        name="unknown_tool_default_deny",
        ctx=EvaluationContext(tool="unknown.action"),
        expected_outcome="deny",
        expected_rule_id=None,
        expected_reason_substr="default_deny",
    ),
    # 21. Deny on exact injection score boundary
    PolicyTestCase(
        name="injection_score_boundary_match",
        ctx=EvaluationContext(tool="test.tool", injection_score=0.8),
        expected_outcome="deny",
        expected_rule_id="R5-deny-high-injection",
        expected_reason_substr="R5-deny-high-injection",
    ),
]


@pytest.mark.parametrize("tc", TEST_CASES, ids=lambda tc: tc.name)
def test_policy_engine_table_driven(test_policy: PolicyDefinition, tc: PolicyTestCase) -> None:
    """Execute table-driven test cases covering rule types and precedence."""
    decision = evaluate_policy(test_policy, tc.ctx)
    assert decision.outcome == tc.expected_outcome
    assert decision.rule_id == tc.expected_rule_id
    assert tc.expected_reason_substr in decision.reason
    assert decision.policy_version == test_policy.version
    if tc.expected_redacted:
        assert sorted(decision.redacted_fields) == sorted(tc.expected_redacted)


def test_agent_id_matching() -> None:
    """Verify explicit agent ID matching."""
    policy = PolicyDefinition(
        policy="id-guard",
        version=1,
        rules=[
            PolicyRule(
                id="R-agent-specific",
                effect="allow",
                agent=AgentMatcher(id="11111111-1111-1111-1111-111111111111"),
                tool="admin.task",
            )
        ],
    )
    # Matching ID
    match_ctx = EvaluationContext(
        agent_id="11111111-1111-1111-1111-111111111111", tool="admin.task"
    )
    assert evaluate_policy(policy, match_ctx).outcome == "allow"

    # Mismatched ID
    nomatch_ctx = EvaluationContext(
        agent_id="22222222-2222-2222-2222-222222222222", tool="admin.task"
    )
    assert evaluate_policy(policy, nomatch_ctx).outcome == "deny"


def test_redact_field_aggregation() -> None:
    """Verify multiple matching redact rules aggregate all redacted fields."""
    policy = PolicyDefinition(
        policy="aggregate-redact",
        version=2,
        rules=[
            PolicyRule(id="R1", effect="redact", tool="user.get", redact=["email", "phone"]),
            PolicyRule(id="R2", effect="redact", tool="user.get", redact=["pan", "aadhaar"]),
        ],
    )
    ctx = EvaluationContext(tool="user.get")
    dec = evaluate_policy(policy, ctx)
    assert dec.outcome == "redact"
    assert sorted(dec.redacted_fields) == ["aadhaar", "email", "pan", "phone"]


def test_invalid_policy_duplicate_rule_id() -> None:
    """Reject policies with duplicate rule IDs."""
    yaml_dup = """
    policy: bad-policy
    version: 1
    rules:
      - id: R1
        effect: allow
      - id: R1
        effect: deny
    """
    with pytest.raises(PolicyValidationError, match="Duplicate rule id 'R1'"):
        load_policy_from_yaml(yaml_dup)


def test_invalid_policy_empty_redact_list() -> None:
    """Reject redact rules without a non-empty redact list."""
    yaml_bad_redact = """
    policy: bad-redact
    version: 1
    rules:
      - id: R-redact
        effect: redact
        redact: []
    """
    with pytest.raises(PolicyValidationError, match="must specify non-empty 'redact' list"):
        load_policy_from_yaml(yaml_bad_redact)


def test_invalid_policy_non_positive_version() -> None:
    """Reject policies with zero or negative version."""
    yaml_bad_ver = """
    policy: bad-ver
    version: 0
    rules: []
    """
    with pytest.raises(PolicyValidationError, match="must be positive integer"):
        load_policy_from_yaml(yaml_bad_ver)


def test_default_policy_configurable() -> None:
    """Confirm defaults other than deny can be configured if declared."""
    policy = PolicyDefinition(
        policy="open-guard",
        version=1,
        defaults=PolicyDefaults(decision="allow"),
        rules=[],
    )
    ctx = EvaluationContext(tool="any.tool")
    dec = evaluate_policy(policy, ctx)
    assert dec.outcome == "allow"
    assert dec.rule_id is None
