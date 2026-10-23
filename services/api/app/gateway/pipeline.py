import contextlib
import hashlib
import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import append_audit_log, build_audit_payload
from app.auth.service import authenticate_agent
from app.events.bus import publish_event
from app.gateway.schemas import ToolCallRequest, ToolCallResponse
from app.limits.service import check_limits
from app.models.agent import Agent, AgentToolGrant
from app.models.decision import Approval, Decision
from app.models.policy import Policy, PolicyVersion
from app.models.session import Action, Session
from app.models.tool import Tool
from app.policy.engine import evaluate_policy
from app.policy.loader import load_policy_from_file, load_policy_from_yaml
from app.policy.schemas import EvaluationContext, PolicyDefinition
from app.stubs.injection import scan_injection
from app.stubs.pii import detect_pii, redact_args

logger = logging.getLogger(__name__)

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


async def _deny_with_audit(
    session: AsyncSession,
    agent_id: UUID,
    agent_name: str,
    decision_id: UUID,
    req: ToolCallRequest,
    reason: str,
    event_type: str = "decision.denied",
) -> ToolCallResponse:
    audit_payload = build_audit_payload(
        agent_id=agent_id,
        tool=req.tool,
        args=req.args,
        data_classes=[],
        outcome="deny",
        reason=reason,
        session_id=req.session_id,
        event_type=event_type,
    )
    audit_entry = await append_audit_log(session, audit_payload)
    with contextlib.suppress(Exception):
        await publish_event(
            "action.decided",
            {
                "decision_id": str(decision_id),
                "action_id": str(audit_entry.payload_json.get("action_id", decision_id)),
                "agent_id": str(agent_id),
                "agent_name": agent_name,
                "tool_id": req.tool,
                "outcome": "deny",
                "rule_id": None,
                "risk_score": 0.0,
                "session_id": str(req.session_id) if req.session_id else None,
                "parent_action_id": str(req.parent_action_id) if req.parent_action_id else None,
                "audit_seq": audit_entry.seq,
                "data_classes": [],
                "latency_ms": 0.0,
            },
        )
    return ToolCallResponse(
        decision="deny",
        rule_id=None,
        reason=reason,
        decision_id=decision_id,
    )


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
    t_pipeline_start = time.perf_counter()
    stage_timings: dict[str, float] = {}
    decision_id = uuid4()
    agent: Agent | None = None

    # Step 1: Identity & Authentication
    # Note: Authentication errors raise AuthError and are handled by the caller/router for HTTP 401
    t_auth_start = time.perf_counter()
    agent = await authenticate_agent(session, req.agent_key)
    stage_timings["auth_ms"] = (time.perf_counter() - t_auth_start) * 1000.0
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
        t_grants_start = time.perf_counter()
        grants_stmt = (
            select(Tool.id, Tool.name)
            .join(AgentToolGrant, AgentToolGrant.tool_id == Tool.id)
            .where(AgentToolGrant.agent_id == agent_id)
        )
        granted_res = await session.execute(grants_stmt)
        granted_tools = {name: tool_id for tool_id, name in granted_res.all()}
        stage_timings["grants_ms"] = (time.perf_counter() - t_grants_start) * 1000.0

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

        tool_id = granted_tools[req.tool]

        # Step 2c: Approval Token Redemption (if retrying an approved escalated call)
        if req.approval_token:
            token_hash = hashlib.sha256(req.approval_token.strip().encode()).hexdigest()
            appr_stmt = select(Approval).where(Approval.token_hash == token_hash)
            appr_res = await session.execute(appr_stmt)
            approval = appr_res.scalar_one_or_none()

            req_args_hash = hashlib.sha256(
                json.dumps(req.args, sort_keys=True).encode()
            ).hexdigest()

            if not approval:
                return await _deny_with_audit(
                    session=session,
                    agent_id=agent_id,
                    agent_name=agent.name,
                    decision_id=decision_id,
                    req=req,
                    reason="approval_token_invalid",
                    event_type="approval.rejected",
                )
            if approval.token_consumed:
                return await _deny_with_audit(
                    session=session,
                    agent_id=agent_id,
                    agent_name=agent.name,
                    decision_id=decision_id,
                    req=req,
                    reason="approval_token_already_consumed",
                    event_type="approval.rejected",
                )
            if approval.status != "approved":
                return await _deny_with_audit(
                    session=session,
                    agent_id=agent_id,
                    agent_name=agent.name,
                    decision_id=decision_id,
                    req=req,
                    reason=f"approval_status_{approval.status}",
                    event_type="approval.rejected",
                )
            if approval.token_expires_at:
                expires_at = (
                    approval.token_expires_at.replace(tzinfo=UTC)
                    if approval.token_expires_at.tzinfo is None
                    else approval.token_expires_at
                )
                if expires_at < datetime.now(UTC):
                    approval.status = "expired"
                    await session.commit()
                    return await _deny_with_audit(
                        session=session,
                        agent_id=agent_id,
                        agent_name=agent.name,
                        decision_id=decision_id,
                        req=req,
                        reason="approval_token_expired",
                        event_type="approval.expired",
                    )
            if approval.agent_id != agent_id:
                return await _deny_with_audit(
                    session=session,
                    agent_id=agent_id,
                    agent_name=agent.name,
                    decision_id=decision_id,
                    req=req,
                    reason="approval_agent_mismatch",
                    event_type="approval.rejected",
                )
            if approval.args_hash != req_args_hash:
                return await _deny_with_audit(
                    session=session,
                    agent_id=agent_id,
                    agent_name=agent.name,
                    decision_id=decision_id,
                    req=req,
                    reason="approval_args_mismatch",
                    event_type="approval.rejected",
                )

            # Valid approval token: consume single-use token and allow execution
            approval.token_consumed = True
            await session.commit()

            consumed_payload = build_audit_payload(
                agent_id=agent_id,
                tool=req.tool,
                args=req.args,
                data_classes=[],
                outcome="allow",
                rule_id=f"approved:{approval.id}",
                reason=f"Human approval granted by {approval.approver or 'operator'}",
                session_id=req.session_id,
                event_type="approval.consumed",
            )
            audit_entry = await append_audit_log(session, consumed_payload)

            with contextlib.suppress(Exception):
                await publish_event(
                    "action.decided",
                    {
                        "decision_id": str(decision_id),
                        "action_id": str(audit_entry.payload_json.get("action_id", decision_id)),
                        "agent_id": str(agent_id),
                        "agent_name": agent.name,
                        "tool_id": req.tool,
                        "outcome": "allow",
                        "rule_id": f"approved:{approval.id}",
                        "risk_score": 0.0,
                        "session_id": str(req.session_id) if req.session_id else None,
                        "parent_action_id": (
                            str(req.parent_action_id) if req.parent_action_id else None
                        ),
                        "audit_seq": audit_entry.seq,
                        "data_classes": [],
                        "latency_ms": 0.0,
                    },
                )

            return ToolCallResponse(
                decision="allow",
                rule_id=f"approved:{approval.id}",
                reason=f"Human approval granted by {approval.approver or 'operator'}",
                decision_id=decision_id,
                data_classes=[],
            )

        # Step 3: Inbound Injection Scan & Step 4: PII Detection
        t_stubs_start = time.perf_counter()
        injection_score = scan_injection(req.context)
        data_classes = detect_pii(req.args)
        stage_timings["stubs_ms"] = (time.perf_counter() - t_stubs_start) * 1000.0

        # Step 5: Policy Evaluation
        t_policy_start = time.perf_counter()
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
        stage_timings["policy_ms"] = (time.perf_counter() - t_policy_start) * 1000.0

        # Step 6: Budget & Loop Limits Check (only if not already denied)
        t_limits_start = time.perf_counter()
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
        stage_timings["limits_ms"] = (time.perf_counter() - t_limits_start) * 1000.0

        # Step 7: Risk Score (advisory signal - can tighten allow -> escalate, never permit deny)
        if outcome == "allow" and injection_score >= 0.7:
            outcome = "escalate"
            reason = f"High risk/injection signal detected (score: {injection_score:.2f})"

        # Step 8: Append Serialized Hash-Chained Audit Record (Single atomic transaction)
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
        audit_sub_timings: dict[str, float] = {}
        audit_entry = await append_audit_log(
            session, audit_payload, auto_commit=False, timings=audit_sub_timings
        )

        # Step 9: Best-effort event publishing to Redis pub/sub and WebSocket streams
        t_events_start = time.perf_counter()
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
        stage_timings["events_ms"] = (time.perf_counter() - t_events_start) * 1000.0

        approval_id: UUID | None = uuid4() if outcome == "escalate" else None

        # Step 8b: Persist Relational Session, Action, Decision, and Approval rows (single commit)
        t_rel_start = time.perf_counter()
        action_id = uuid4()

        if tool_id:
            session_obj = await session.get(Session, req.session_id)
            if not session_obj:
                session_obj = Session(
                    id=req.session_id,
                    agent_id=agent_id,
                    goal=req.purpose or f"Execution task workflow for {agent.name}",
                )
                session.add(session_obj)
                act_seq = 1
            else:
                act_seq = (
                    await session.execute(
                        select(func.count(Action.id)).where(Action.session_id == req.session_id)
                    )
                ).scalar() or 0
                act_seq += 1

            action_record = Action(
                id=action_id,
                session_id=req.session_id,
                seq=act_seq,
                tool_id=tool_id,
                args_json=redacted_args or req.args,
                purpose=req.purpose,
                data_classes=data_classes,
                parent_action_id=req.parent_action_id,
            )
            session.add(action_record)

            decision_record = Decision(
                id=decision_id,
                action_id=action_id,
                outcome=outcome,
                rule_id=rule_id,
                reason=reason,
                risk_score=float(injection_score),
                injection_score=float(injection_score),
                latency_ms=int(stage_timings.get("policy_ms", 0)),
            )
            session.add(decision_record)

            if outcome == "escalate" and approval_id:
                args_hash_val = hashlib.sha256(
                    json.dumps(req.args, sort_keys=True).encode()
                ).hexdigest()
                approval_record = Approval(
                    id=approval_id,
                    decision_id=decision_id,
                    agent_id=agent_id,
                    tool_id=tool_id,
                    args_hash=args_hash_val,
                    risk_score=float(injection_score),
                    rule_id=rule_id,
                    reason=reason,
                    status="pending",
                    token_consumed=False,
                )
                session.add(approval_record)

                # Record audit event for approval creation
                approval_audit = build_audit_payload(
                    agent_id=agent_id,
                    tool=req.tool,
                    args=req.args,
                    data_classes=data_classes,
                    outcome="escalate",
                    rule_id=rule_id,
                    policy_version=active_policy.version,
                    reason="approval_requested",
                    session_id=req.session_id,
                    event_type="approval.created",
                )
                await append_audit_log(
                    session, approval_audit, auto_commit=False, timings=audit_sub_timings
                )

                with contextlib.suppress(Exception):
                    await publish_event(
                        "approval.created",
                        {
                            "approval_id": str(approval_id),
                            "decision_id": str(decision_id),
                            "agent_id": str(agent_id),
                            "agent_name": agent.name,
                            "tool": req.tool,
                            "rule_id": rule_id,
                            "risk_score": float(injection_score),
                            "reason": reason,
                            "args_hash": args_hash_val,
                            "status": "pending",
                            "created_at": datetime.now(UTC).isoformat(),
                        },
                    )

        t_commit_start = time.perf_counter()
        await session.commit()
        t_commit_end = time.perf_counter()

        commit_duration_ms = (t_commit_end - t_commit_start) * 1000.0
        audit_sub_timings["commit_ms"] = commit_duration_ms
        stage_timings["audit_ms"] = (
            audit_sub_timings.get("lock_wait_ms", 0.0)
            + audit_sub_timings.get("query_prev_ms", 0.0)
            + audit_sub_timings.get("hash_compute_ms", 0.0)
            + audit_sub_timings.get("insert_ms", 0.0)
            + audit_sub_timings.get("checkpoint_ms", 0.0)
            + commit_duration_ms
        )
        stage_timings["relational_persist_ms"] = (t_commit_start - t_rel_start) * 1000.0
        for sub_k, sub_v in audit_sub_timings.items():
            stage_timings[f"stage6_{sub_k}"] = sub_v

        stage_timings["total_ms"] = (time.perf_counter() - t_pipeline_start) * 1000.0

        return ToolCallResponse(
            decision=outcome,
            rule_id=rule_id,
            reason=reason,
            redacted_args=redacted_args,
            approval_id=approval_id,
            decision_id=decision_id,
            action_id=action_id,
            data_classes=data_classes,
            stage_timings=stage_timings,
        )

    except Exception as exc:
        logger.exception("Pipeline execution failed closed: %s", exc)
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
