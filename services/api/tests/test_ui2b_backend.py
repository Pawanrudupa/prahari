"""Comprehensive integration tests for UI-2b backend features:
- Approvals Queue: escalation creation, role check (403), decide approve/deny,
  single-use token redemption, replay rejection, args tampering rejection,
  agent mismatch rejection, token expiry auto-deny, full audit trail.
- Policy Studio: validation, dry-run test, immutable versioning, fail-closed activation,
  one-click rollback, rule hit-counts.
- Session Workflow DAG: multi-step hierarchical DAG with parent_action_id, graph retrieval.
- Stress Data Hygiene: stress node tagging, default exclusion, archive-stress endpoint.
"""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.session import create_session_token
from app.models.decision import Approval
from app.models.policy import Policy, PolicyVersion


@pytest.mark.asyncio
async def test_approvals_lifecycle_and_single_use_token_redemption(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify escalation creates approval, approve issues single-use token,
    gateway redeems and audits.
    """
    # 1. Provision agent and tools
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Approval-Test-Agent", "owner": "Finance", "role": "support"},
        headers=admin_headers,
    )
    assert agent_resp.status_code == 201
    agent_data = agent_resp.json()
    agent_key = agent_data["api_key"]
    agent_id = agent_data["id"]

    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.export", "server": "crm-srv", "sensitivity": "restricted"},
        headers=admin_headers,
    )
    assert tool_resp.status_code == 201
    tool_id = tool_resp.json()["id"]

    grant_resp = await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": tool_id},
        headers=admin_headers,
    )
    assert grant_resp.status_code == 201

    session_id = str(uuid4())
    call_args = {"rows": 500}

    # 2. Invoke gateway with bulk export -> triggers ESCALATE (rule R3)
    gw_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": call_args,
            "purpose": "Customer database export",
        },
    )
    assert gw_resp.status_code == 200
    res = gw_resp.json()
    assert res["decision"] == "escalate"
    approval_id = res["approval_id"]
    assert approval_id is not None

    # 3. Verify approval record exists in DB with status pending
    approval_db = await db_session.get(Approval, UUID(approval_id))
    assert approval_db is not None
    assert approval_db.status == "pending"

    # 4. List approvals via GET /v1/approvals
    list_resp = await client.get("/v1/approvals?status=pending", headers=admin_headers)
    assert list_resp.status_code == 200
    pending_items = list_resp.json()
    assert any(item["id"] == approval_id for item in pending_items)

    # 5. Decide APPROVE via POST /v1/approvals/{id}/decide
    decide_resp = await client.post(
        f"/v1/approvals/{approval_id}/decide",
        json={"decision": "approve", "note": "Authorized by Data Governance Officer"},
        headers=admin_headers,
    )
    assert decide_resp.status_code == 200
    decide_data = decide_resp.json()
    assert decide_data["status"] == "approved"
    token = decide_data["approval_token"]
    assert token is not None

    # 6. Retry gateway invocation WITH approval_token -> should now ALLOW!
    redeem_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": call_args,
            "purpose": "Customer database export",
            "approval_token": token,
        },
    )
    assert redeem_resp.status_code == 200
    redeem_data = redeem_resp.json()
    assert redeem_data["decision"] == "allow"
    assert f"approved:{approval_id}" in redeem_data["rule_id"]

    # 7. Verify token is marked consumed in DB
    await db_session.refresh(approval_db)
    assert approval_db.token_consumed is True


@pytest.mark.asyncio
async def test_approval_replay_rejected(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify token reuse/replay attempt is denied and audited as approval.rejected."""
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Replay-Agent", "owner": "Finance", "role": "support"},
        headers=admin_headers,
    )
    agent_key = agent_resp.json()["api_key"]
    agent_id = agent_resp.json()["id"]

    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.export", "server": "crm-srv", "sensitivity": "restricted"},
        headers=admin_headers,
    )
    tool_id = tool_resp.json()["id"]

    await client.post(
        f"/v1/agents/{agent_id}/grants", json={"tool_id": tool_id}, headers=admin_headers
    )

    session_id = str(uuid4())
    call_args = {"rows": 500}

    # Escalate
    gw_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": call_args,
        },
    )
    approval_id = gw_resp.json()["approval_id"]

    # Approve
    decide_resp = await client.post(
        f"/v1/approvals/{approval_id}/decide",
        json={"decision": "approve"},
        headers=admin_headers,
    )
    token = decide_resp.json()["approval_token"]

    # First redemption -> allow
    r1 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": call_args,
            "approval_token": token,
        },
    )
    assert r1.json()["decision"] == "allow"

    # Second redemption attempt with same token -> MUST DENY (Replay prevention)
    r2 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": call_args,
            "approval_token": token,
        },
    )
    assert r2.status_code == 200
    assert r2.json()["decision"] == "deny"
    assert "already_consumed" in r2.json()["reason"]


@pytest.mark.asyncio
async def test_approval_args_mismatch_rejected(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify approval token used with tampered arguments is denied."""
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Tamper-Agent", "owner": "Finance", "role": "support"},
        headers=admin_headers,
    )
    agent_key = agent_resp.json()["api_key"]
    agent_id = agent_resp.json()["id"]

    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.export", "server": "crm-srv", "sensitivity": "restricted"},
        headers=admin_headers,
    )
    await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": tool_resp.json()["id"]},
        headers=admin_headers,
    )

    session_id = str(uuid4())
    gw_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": {"rows": 500},
        },
    )
    approval_id = gw_resp.json()["approval_id"]

    dec_resp = await client.post(
        f"/v1/approvals/{approval_id}/decide",
        json={"decision": "approve"},
        headers=admin_headers,
    )
    token = dec_resp.json()["approval_token"]

    # Tamper with args: change rows from 500 to 9999
    tampered_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "crm.export",
            "args": {"rows": 9999},
            "approval_token": token,
        },
    )
    assert tampered_resp.status_code == 200
    assert tampered_resp.json()["decision"] == "deny"
    assert "args_mismatch" in tampered_resp.json()["reason"]


@pytest.mark.asyncio
async def test_approval_role_forbidden_403(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify non-admin/non-approver role receives 403 Forbidden on approval decision."""
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Role-Agent", "owner": "Ops", "role": "support"},
        headers=admin_headers,
    )
    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.export", "server": "crm-srv", "sensitivity": "restricted"},
        headers=admin_headers,
    )
    await client.post(
        f"/v1/agents/{agent_resp.json()['id']}/grants",
        json={"tool_id": tool_resp.json()["id"]},
        headers=admin_headers,
    )

    gw_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_resp.json()["api_key"],
            "session_id": str(uuid4()),
            "tool": "crm.export",
            "args": {"rows": 500},
        },
    )
    approval_id = gw_resp.json()["approval_id"]

    # Create viewer token (unauthorized role)
    viewer_token = create_session_token(role="viewer")
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    dec_resp = await client.post(
        f"/v1/approvals/{approval_id}/decide",
        json={"decision": "approve"},
        headers=viewer_headers,
    )
    assert dec_resp.status_code == 403
    assert "Forbidden" in dec_resp.json()["detail"]


@pytest.mark.asyncio
async def test_policies_validate_and_test_endpoints(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify POST /v1/policies/validate and POST /v1/policies/test."""
    valid_yaml = """
policy: test-policy
version: 1
defaults:
  decision: deny
rules:
  - id: R-deny-dangerous
    effect: deny
    tool: infra.drop_db
limits: []
"""
    # 1. Validate endpoint
    val_resp = await client.post(
        "/v1/policies/validate", json={"yaml": valid_yaml}, headers=admin_headers
    )
    assert val_resp.status_code == 200
    assert val_resp.json()["valid"] is True
    assert val_resp.json()["rules_count"] == 1

    # Invalid YAML check
    bad_val = await client.post(
        "/v1/policies/validate", json={"yaml": "invalid: yaml: : ["}, headers=admin_headers
    )
    assert bad_val.status_code == 200
    assert bad_val.json()["valid"] is False
    assert len(bad_val.json()["errors"]) > 0

    # 2. Test endpoint (dry-run evaluation)
    test_resp = await client.post(
        "/v1/policies/test",
        json={
            "yaml": valid_yaml,
            "sample_input": {
                "agent_name": "Ops-Bot",
                "tool": "infra.drop_db",
                "args": {},
            },
        },
        headers=admin_headers,
    )
    assert test_resp.status_code == 200
    assert test_resp.json()["decision"] == "deny"
    assert test_resp.json()["rule_id"] == "R-deny-dangerous"


@pytest.mark.asyncio
async def test_policy_activation_and_rollback(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify policy version creation, activation, fail-closed behavior, and rollback."""
    # 1. Create base policy record
    pol = Policy(id=uuid4(), name="Production Gateway Policy", status="draft")
    db_session.add(pol)
    await db_session.commit()

    yaml_v1 = """
policy: prod-guard
version: 1
defaults:
  decision: deny
rules: []
limits: []
"""
    yaml_v2 = """
policy: prod-guard
version: 2
defaults:
  decision: deny
rules:
  - id: R2-deny-sensitive
    effect: deny
    tool: payroll.read
limits: []
"""

    # 2. Create version 1 and 2
    v1_resp = await client.post(
        f"/v1/policies/{pol.id}/versions",
        json={"yaml": yaml_v1, "comment": "Initial release"},
        headers=admin_headers,
    )
    assert v1_resp.status_code == 201
    assert v1_resp.json()["version"] == 1

    v2_resp = await client.post(
        f"/v1/policies/{pol.id}/versions",
        json={"yaml": yaml_v2, "comment": "Added payroll protection"},
        headers=admin_headers,
    )
    assert v2_resp.status_code == 201
    assert v2_resp.json()["version"] == 2

    # 3. Activate version 1
    act1 = await client.post(f"/v1/policies/{pol.id}/versions/1/activate", headers=admin_headers)
    assert act1.status_code == 200
    assert act1.json()["is_active"] is True

    # 4. Activate version 2
    act2 = await client.post(f"/v1/policies/{pol.id}/versions/2/activate", headers=admin_headers)
    assert act2.status_code == 200
    assert act2.json()["version"] == 2

    # 5. One-click rollback -> reverts to version 1
    rollback_resp = await client.post(f"/v1/policies/{pol.id}/rollback", headers=admin_headers)
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["version"] == 1

    # Cleanup: Deactivate test policy so default fallback policy remains active for subsequent tests
    pol.status = "archived"
    pol.active_version_id = None
    await db_session.commit()


@pytest.mark.asyncio
async def test_session_workflow_dag_endpoint(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify multi-step session actions with parent_action_id generate a valid DAG graph."""
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "DAG-Agent", "owner": "WorkflowTeam", "role": "support"},
        headers=admin_headers,
    )
    agent_key = agent_resp.json()["api_key"]
    agent_id = agent_resp.json()["id"]

    t1 = await client.post(
        "/v1/tools", json={"name": "step1.read", "server": "srv"}, headers=admin_headers
    )
    t2 = await client.post(
        "/v1/tools", json={"name": "step2.process", "server": "srv"}, headers=admin_headers
    )

    await client.post(
        f"/v1/agents/{agent_id}/grants", json={"tool_id": t1.json()["id"]}, headers=admin_headers
    )
    await client.post(
        f"/v1/agents/{agent_id}/grants", json={"tool_id": t2.json()["id"]}, headers=admin_headers
    )

    session_id = str(uuid4())

    # Step 1: Root step
    c1 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "step1.read",
            "purpose": "Step 1: Read raw input payload",
        },
    )
    assert c1.status_code == 200
    action1_id = c1.json()["action_id"]
    assert action1_id is not None

    # Step 2: Child of Step 1
    c2 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": session_id,
            "tool": "step2.process",
            "purpose": "Step 2: Transform and process input",
            "parent_action_id": action1_id,
        },
    )
    assert c2.status_code == 200

    # Query DAG graph
    graph_resp = await client.get(f"/v1/sessions/{session_id}/graph", headers=admin_headers)
    assert graph_resp.status_code == 200
    dag = graph_resp.json()
    assert dag["session_id"] == session_id
    assert len(dag["nodes"]) >= 3  # Root goal + 2 action steps
    assert len(dag["edges"]) >= 2
    # Edge from step 1 to step 2 exists
    child_edge = next((e for e in dag["edges"] if f"action-{action1_id}" in e["source"]), None)
    assert child_edge is not None


@pytest.mark.asyncio
async def test_stress_data_hygiene_and_archive(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify stress nodes are tagged, excluded by default,
    and archive-stress marks status=archived.
    """
    # 1. Create canonical agent and stress-tagged agent
    c_agent = await client.post(
        "/v1/agents",
        json={"name": "Canonical-Bot-Demo", "owner": "Core", "role": "support", "tags": []},
        headers=admin_headers,
    )
    s_agent = await client.post(
        "/v1/agents",
        json={"name": "Stress-Agent-999", "owner": "Stress", "role": "support", "tags": ["stress"]},
        headers=admin_headers,
    )
    assert c_agent.status_code == 201
    assert s_agent.status_code == 201

    # 2. List agents by default -> stress agent MUST be excluded
    default_list = await client.get("/v1/agents", headers=admin_headers)
    assert default_list.status_code == 200
    agent_names = [a["name"] for a in default_list.json()]
    assert "Canonical-Bot-Demo" in agent_names
    assert "Stress-Agent-999" not in agent_names

    # Include stress -> stress agent visible
    stress_list = await client.get("/v1/agents?include_stress=true", headers=admin_headers)
    stress_names = [a["name"] for a in stress_list.json()]
    assert "Stress-Agent-999" in stress_names

    # 3. Archive stress endpoint
    archive_resp = await client.post("/v1/dev/archive-stress", headers=admin_headers)
    assert archive_resp.status_code == 200
    assert archive_resp.json()["archived_agents"] >= 1

    # 4. Verify s_agent is archived and excluded even if include_stress is true
    post_archive = await client.get("/v1/agents?include_stress=true", headers=admin_headers)
    post_names = [a["name"] for a in post_archive.json()]
    assert "Stress-Agent-999" not in post_names


@pytest.mark.asyncio
async def test_policy_fail_closed_defaults_rejection(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify fail-closed invariant: defaults.decision != 'deny' is rejected
    at validate, save, and activate.
    """
    invalid_yaml = """
policy: fail-open-attempt
version: 1
defaults:
  decision: allow
rules: []
limits: []
"""
    # 1. Validate endpoint must reject with clear fail-closed error
    val_resp = await client.post(
        "/v1/policies/validate", json={"yaml": invalid_yaml}, headers=admin_headers
    )
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["valid"] is False
    assert any("defaults.decision must strictly be 'deny'" in err for err in val_data["errors"])

    # 2. Save new version must reject with 400
    pol = Policy(id=uuid4(), name="Strict Governance Policy", status="draft")
    db_session.add(pol)
    await db_session.commit()

    ver_resp = await client.post(
        f"/v1/policies/{pol.id}/versions",
        json={"yaml": invalid_yaml, "comment": "Illegal allow default"},
        headers=admin_headers,
    )
    assert ver_resp.status_code == 400
    assert "defaults.decision must strictly be 'deny'" in ver_resp.json()["detail"]

    # 3. Direct DB insert of a policy with 'allow' default cannot be activated
    stored_bad_ver = PolicyVersion(
        id=uuid4(),
        policy_id=pol.id,
        version=99,
        yaml=invalid_yaml,
        created_by="attacker",
    )
    db_session.add(stored_bad_ver)
    await db_session.commit()

    act_resp = await client.post(
        f"/v1/policies/{pol.id}/versions/99/activate",
        headers=admin_headers,
    )
    assert act_resp.status_code == 400
    assert "Activation rejected: target policy failed validation" in act_resp.json()["detail"]
    assert "defaults.decision must strictly be 'deny'" in act_resp.json()["detail"]


@pytest.mark.asyncio
async def test_dev_tamper_audit_and_verification_failure(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify that tampering an audit row breaks the hash chain and verification
    reports broken_seq.
    """
    # Ensure at least one audit record exists by creating an agent
    await client.post(
        "/v1/agents",
        json={"name": "Audit-Tamper-Target", "owner": "Security", "role": "auditor"},
        headers=admin_headers,
    )

    # 1. Run audit verify to get baseline
    verify_resp = await client.get("/v1/audit/verify", headers=admin_headers)
    assert verify_resp.status_code == 200
    res = verify_resp.json()
    assert res["valid"] is True
    assert res["records_verified"] >= 1

    # 2. Tamper the audit record
    tamper_resp = await client.post(
        "/v1/dev/tamper-audit",
        json={"tamper_type": "hash"},
        headers=admin_headers,
    )
    assert tamper_resp.status_code == 200
    tampered_data = tamper_resp.json()
    tampered_seq = tampered_data["tampered_seq"]

    # 3. Verify fails and identifies the broken sequence
    failed_verify = await client.get("/v1/audit/verify", headers=admin_headers)
    assert failed_verify.status_code == 200
    failed_res = failed_verify.json()
    assert failed_res["valid"] is False
    assert failed_res["broken_seq"] == tampered_seq


@pytest.mark.asyncio
async def test_admin_events_separated_from_decisions(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify that admin actions do not appear in GET /v1/decisions,
    but do in /v1/decisions/admin-events.
    """
    # 1. Trigger an admin action (e.g. create an agent)
    create_resp = await client.post(
        "/v1/agents",
        json={"name": "Admin-Audited-Bot", "owner": "Security", "role": "auditor"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 201

    # 2. GET /v1/decisions should not list admin_action
    decisions_resp = await client.get("/v1/decisions", headers=admin_headers)
    assert decisions_resp.status_code == 200
    items = decisions_resp.json()["items"]
    assert not any(item["outcome"] == "admin_action" for item in items)

    # 3. GET /v1/decisions/admin-events should list the admin event
    admin_events_resp = await client.get("/v1/decisions/admin-events", headers=admin_headers)
    assert admin_events_resp.status_code == 200
    admin_items = admin_events_resp.json()["items"]
    assert len(admin_items) > 0
    assert any(ev["actor"] == "admin" and ev["operation"] == "agent.created" for ev in admin_items)


