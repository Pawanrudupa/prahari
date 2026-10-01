import contextlib
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import append_audit_log, build_audit_payload
from app.auth.service import authenticate_agent
from app.events.bus import publish_event
from app.gateway.schemas import ToolCallRequest, ToolCallResponse
from app.limits.service import check_limits
from app.models.agent import Agent, AgentToolGrant
from app.models.policy import Policy, PolicyVersion
from app.models.tool import Tool
from app.policy.engine import evaluate_policy
from app.policy.loader import load_policy_from_file, load_policy_from_yaml
from app.policy.schemas import EvaluationContext, PolicyDefinition
from app.stubs.injection import scan_injection
from app.stubs.pii import detect_pii, redact_args

# Fallback default policy loaded from example
_DEFAULT_POLICY_PATH = (
    Path(__file__).resolve().parents[4] / "policies" / "examples" / "sample-policy.yaml"
)
_CACHED_POLICY: PolicyDefinition | None = None


def get_fallback_policy() -> PolicyDefinition:
    """Load or return cached sample policy."""
    global _CACHED_POLICY
    if _CACHED_POLICY is None:
        if _DEFAULT_POLICY_PATH.is_file():
            _CACHED_POLICY = load_policy_from_file(_DEFAULT_POLICY_PATH)
        else:
            # Minimal embedded fallback policy
            yaml_fallback = """
            policy: default-guard
            version: 1
            defaults: { decision: deny }
            rules: []
            limits: []
            """
            _CACHED_POLICY = load_policy_from_yaml(yaml_fallback)
    return _CACHED_POLICY


async def get_active_policy(session: AsyncSession) -> PolicyDefinition:
    """Fetch active policy from DB or fall back to default policy."""
    try:
        stmt = (
            select(PolicyVersion.yaml)
            .join(Policy, Policy.active_version_id == PolicyVersion.id)
            .where(Policy.status == "active")
            .limit(1)
        )
        res = await session.execute(stmt)
        yaml_content = res.scalar_one_or_none()
        if yaml_content:
            return load_policy_from_yaml(yaml_content)
    except Exception:
        pass
    return get_fallback_policy()


async def execute_gateway_pipeline(
    session: AsyncSession,
    redis: Redis | None,
    req: ToolCallRequest,
    active_policy: PolicyDefinition | None = None,
) -> ToolCallResponse:
    """
    Execute tool-call governance pipeline per docs/03-ARCHITECTURE.md:
    1. Authenticate agent (reject unknown/disabled with 401 and audit).
    2. Validate request schema.
    3. Injection scan on inbound context/tool outputs.
    4. PII detect; tag data classes; apply redactions if policy dictates.
    5. Deterministic policy evaluation (deny > escalate > redact > allow > default deny).
    6. Budget and loop limits check.
    7. Risk score check (tighten only).
    8. Emit decision and append serialized hash-chained audit record.

    FAIL CLOSED INVARIANT: Any error in the decision path yields deny with reason engine_error.
    """
    decision_id = uuid4()
    agent: Agent | None = None

    # Step 1: Identity & Authentication
    # Note: Authentication errors raise AuthError and are handled by the caller/router for HTTP 401
    agent = await authenticate_agent(session, req.agent_key)
    agent_id: UUID = agent.id

    try:
        # Step 2: Request Schema & Format Check
        if not req.tool or not req.tool.strip():
            audit_payload = build_audit_payload(
                agent_id=agent_id,
                tool=req.tool,
                args=req.args,
                data_classes=[],
                outcome="deny",
                reason="malformed_tool_name",
            )
            audit_entry = await append_audit_log(session, audit_payload)
            with contextlib.suppress(Exception):
                await publish_event(
                    "action.decided",
                    {
                        "decision_id": str(decision_id),
                        "action_id": str(audit_entry.payload_json.get("action_id", decision_id)),
                        "agent_id": str(agent_id),
                        "agent_name": agent.name,
                        "tool_id": req.tool,
                        "outcome": "deny",
                        "rule_id": None,
                        "risk_score": 0.0,
                        "session_id": str(req.session_id) if req.session_id else None,
                        "parent_action_id": None,
                        "audit_seq": audit_entry.seq,
                        "data_classes": [],
                        "latency_ms": 0.0,
                    },
                )
            return ToolCallResponse(
                decision="deny",
                rule_id=None,
                reason="malformed_tool_name",
                decision_id=decision_id,
            )

        # Step 2b: Tool Grant Capability Check ("No grants = no tools" invariant)
        grants_stmt = (
            select(Tool.name)
            .join(AgentToolGrant, AgentToolGrant.tool_id == Tool.id)
            .where(AgentToolGrant.agent_id == agent_id)
        )
        granted_res = await session.execute(grants_stmt)
        granted_tools = set(granted_res.scalars().all())

        if req.tool not in granted_tools:
            audit_payload = build_audit_payload(
                agent_id=agent_id,
                tool=req.tool,
                args=req.args,
                data_classes=[],
                outcome="deny",
                reason="tool_not_granted",
                session_id=req.session_id,
            )
            audit_entry = await append_audit_log(session, audit_payload)
            with contextlib.suppress(Exception):
                await publish_event(
                    "action.decided",
                    {
                        "decision_id": str(decision_id),
                        "action_id": str(audit_entry.payload_json.get("action_id", decision_id)),
                        "agent_id": str(agent_id),
                        "agent_name": agent.name,
                        "tool_id": req.tool,
                        "outcome": "deny",
                        "rule_id": None,
                        "risk_score": 0.0,
                        "session_id": str(req.session_id) if req.session_id else None,
                        "parent_action_id": None,
                        "audit_seq": audit_entry.seq,
                        "data_classes": [],
                        "latency_ms": 0.0,
                    },
                )
            return ToolCallResponse(
                decision="deny",
                rule_id=None,
                reason="tool_not_granted",
                decision_id=decision_id,
            )

        # Step 3: Inbound Injection Scan
        injection_score = scan_injection(req.context)

        # Step 4: PII Detection
        data_classes = detect_pii(req.args)

        # Step 5: Policy Evaluation
        if active_policy is None:
            active_policy = await get_active_policy(session)

        eval_ctx = EvaluationContext(
            agent_id=agent_id,
            agent_role=agent.role,
            agent_name=agent.name,
            tool=req.tool,
            args=req.args,
            data_classes=data_classes,
            injection_score=injection_score,
        )

        decision = evaluate_policy(active_policy, eval_ctx)
        outcome = decision.outcome
        rule_id = decision.rule_id
        reason = decision.reason
        redacted_args: dict[str, Any] | None = None

        if outcome == "redact":
            redacted_args = redact_args(req.args, decision.redacted_fields)

        # Step 6: Budget & Loop Limits Check (only if not already denied)
        if outcome in ("allow", "redact"):
            limit_res = await check_limits(
                redis=redis,
                agent_id=agent_id,
                tool=req.tool,
                args=req.args,
                limits=active_policy.limits,
            )
            if not limit_res.allowed:
                outcome = "deny"
                rule_id = limit_res.limit_id
                reason = limit_res.reason or "limit_exceeded"

            # Record degraded or unavailable limits event if Redis was down
            if limit_res.degraded and active_policy.limits:
                is_unavail = limit_res.reason == "limits_unavailable"
                limit_event_type = "limits.unavailable" if is_unavail else "limits.degraded"
                degraded_payload = build_audit_payload(
                    agent_id=agent_id,
                    tool=req.tool,
                    args=req.args,
                    data_classes=data_classes,
                    outcome="deny" if limit_event_type == "limits.unavailable" else "degraded",
                    rule_id=limit_res.limit_id,
                    policy_version=active_policy.version,
                    reason=limit_res.reason or "redis_unavailable_in_memory_fallback",
                    session_id=req.session_id,
                    event_type=limit_event_type,
                )
                await append_audit_log(session, degraded_payload)

        # Step 7: Risk Score (advisory signal - can tighten allow -> escalate, never permit deny)
        if outcome == "allow" and injection_score >= 0.7:
            outcome = "escalate"
            reason = f"High risk/injection signal detected (score: {injection_score:.2f})"

        # Step 8: Append Serialized Hash-Chained Audit Record
        audit_payload = build_audit_payload(
            agent_id=agent_id,
            tool=req.tool,
            args=req.args,
            data_classes=data_classes,
            outcome=outcome,
            rule_id=rule_id,
            policy_version=active_policy.version,
            reason=reason,
            session_id=req.session_id,
        )
        audit_entry = await append_audit_log(session, audit_payload)

        # Step 9: Best-effort event publishing to Redis pub/sub and WebSocket streams
        with contextlib.suppress(Exception):
            await publish_event(
                "action.decided",
                {
                    "decision_id": str(decision_id),
                    "action_id": str(audit_entry.payload_json.get("action_id", decision_id)),
                    "agent_id": str(agent_id),
                    "agent_name": agent.name,
                    "tool_id": req.tool,
                    "outcome": outcome,
                    "rule_id": rule_id,
                    "risk_score": float(injection_score),
                    "session_id": str(req.session_id) if req.session_id else None,
                    "parent_action_id": None,
                    "audit_seq": audit_entry.seq,
                    "data_classes": data_classes,
                    "latency_ms": 0.0,
                },
            )

        approval_id: UUID | None = uuid4() if outcome == "escalate" else None

        return ToolCallResponse(
            decision=outcome,
            rule_id=rule_id,
            reason=reason,
            redacted_args=redacted_args,
            approval_id=approval_id,
            decision_id=decision_id,
            data_classes=data_classes,
        )

    except Exception:
        # FAIL CLOSED: Any unexpected error yields deny with engine_error
        try:
            audit_payload = build_audit_payload(
                agent_id=agent_id,
                tool=req.tool,
                args=req.args,
                data_classes=[],
                outcome="deny",
                reason="engine_error",
                session_id=req.session_id,
            )
            err_entry = await append_audit_log(session, audit_payload)
            with contextlib.suppress(Exception):
                await publish_event(
                    "action.decided",
                    {
                        "decision_id": str(decision_id),
                        "action_id": str(err_entry.payload_json.get("action_id", decision_id)),
                        "agent_id": str(agent_id),
                        "agent_name": agent.name if agent else "unknown",
                        "tool_id": req.tool,
                        "outcome": "deny",
                        "rule_id": None,
                        "risk_score": 0.0,
                        "session_id": str(req.session_id) if req.session_id else None,
                        "parent_action_id": None,
                        "audit_seq": err_entry.seq,
                        "data_classes": [],
                        "latency_ms": 0.0,
                    },
                )
        except Exception:
            pass

        return ToolCallResponse(
            decision="deny",
            rule_id=None,
            reason="engine_error",
            decision_id=decision_id,
        )
