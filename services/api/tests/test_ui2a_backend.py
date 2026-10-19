"""Tests for UI-2a backend endpoints: Agents & Tools admin actions and Decisions pagination."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import append_audit_log, build_audit_payload
from app.models.audit import AuditLog


@pytest.mark.asyncio
async def test_agent_status_toggle_and_audit(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify PATCH /v1/agents/{id} toggles agent status and logs audit event."""
    # 1. Create an agent
    create_resp = await client.post(
        "/v1/agents",
        json={"name": "Toggle-Agent", "owner": "SecOps", "role": "security"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 201
    agent_id = create_resp.json()["id"]

    # 2. Disable agent
    patch_resp = await client.patch(
        f"/v1/agents/{agent_id}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "disabled"

    # 3. Verify audit log contains agent.status_updated event
    stmt = (
        select(AuditLog)
        .where(AuditLog.payload_json["event_type"].as_string() == "agent.status_updated")
        .order_by(AuditLog.seq.desc())
    )
    res = await db_session.execute(stmt)
    entry = res.scalars().first()
    assert entry is not None
    assert entry.payload_json["agent_id"] == str(agent_id)
    assert entry.payload_json["details"]["new_status"] == "disabled"

    # 4. Re-enable agent
    enable_resp = await client.patch(
        f"/v1/agents/{agent_id}",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert enable_resp.status_code == 200
    assert enable_resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_agent_grant_revocation_and_audit(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify DELETE /v1/agents/{id}/grants/{tool_id} revokes grant and logs audit event."""
    # 1. Create agent and tool
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Grant-Agent", "owner": "Ops", "role": "devops"},
        headers=admin_headers,
    )
    agent_id = agent_resp.json()["id"]

    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "k8s.restart_pod", "server": "k8s-mcp", "sensitivity": "high"},
        headers=admin_headers,
    )
    tool_id = tool_resp.json()["id"]

    # 2. Grant tool to agent
    grant_resp = await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": tool_id},
        headers=admin_headers,
    )
    assert grant_resp.status_code == 201

    # Verify grant exists
    list_grants = await client.get(f"/v1/agents/{agent_id}/grants", headers=admin_headers)
    assert len(list_grants.json()) == 1
    assert list_grants.json()[0]["name"] == "k8s.restart_pod"

    # 3. Revoke grant
    del_resp = await client.delete(
        f"/v1/agents/{agent_id}/grants/{tool_id}",
        headers=admin_headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "revoked"

    # Verify grant is gone
    list_grants2 = await client.get(f"/v1/agents/{agent_id}/grants", headers=admin_headers)
    assert len(list_grants2.json()) == 0

    # 4. Verify audit log contains agent.grant_revoked
    stmt = (
        select(AuditLog)
        .where(AuditLog.payload_json["event_type"].as_string() == "agent.grant_revoked")
        .order_by(AuditLog.seq.desc())
    )
    res = await db_session.execute(stmt)
    entry = res.scalars().first()
    assert entry is not None
    assert entry.payload_json["agent_id"] == str(agent_id)


@pytest.mark.asyncio
async def test_agent_activity_sparkline(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify GET /v1/agents/{id}/activity returns time-series points bucketed by window."""
    # 1. Create agent
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Activity-Agent", "owner": "Analytics", "role": "analyst"},
        headers=admin_headers,
    )
    agent_id = agent_resp.json()["id"]

    # 2. Append mock decisions into audit log
    for outcome in ["allow", "allow", "deny", "escalate"]:
        payload = build_audit_payload(
            agent_id=agent_id,
            tool="crm.read_ticket",
            args={},
            data_classes=[],
            outcome=outcome,
            reason="test_activity",
        )
        await append_audit_log(db_session, payload)

    # 3. Query activity for 24h window
    act_resp = await client.get(
        f"/v1/agents/{agent_id}/activity?window=24h",
        headers=admin_headers,
    )
    assert act_resp.status_code == 200
    data = act_resp.json()
    assert data["agent_id"] == str(agent_id)
    assert data["window"] == "24h"
    assert len(data["points"]) == 24
    total_count = sum(p["count"] for p in data["points"])
    assert total_count == 4


@pytest.mark.asyncio
async def test_decisions_pagination_and_filtering(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    """Verify GET /v1/decisions cursor pagination, outcome filtering, and rule filtering."""
    agent_id = str(uuid4())

    # Seed 10 decisions with distinct outcomes and rules
    for i in range(10):
        outcome = "deny" if i % 2 == 0 else "allow"
        rule = f"R{i}-test-rule"
        payload = build_audit_payload(
            agent_id=agent_id,
            tool="crm.export",
            args={"i": i},
            data_classes=["phone"] if i == 3 else [],
            outcome=outcome,
            rule_id=rule,
            reason=f"decision_{i}",
        )
        await append_audit_log(db_session, payload)

    # 1. Fetch first page with limit=4
    page1 = await client.get("/v1/decisions?limit=4", headers=admin_headers)
    assert page1.status_code == 200
    d1 = page1.json()
    assert len(d1["items"]) == 4
    assert d1["has_more"] is True
    assert d1["next_cursor"] is not None

    # 2. Fetch second page with cursor
    cursor = d1["next_cursor"]
    page2 = await client.get(f"/v1/decisions?limit=4&cursor={cursor}", headers=admin_headers)
    assert page2.status_code == 200
    d2 = page2.json()
    assert len(d2["items"]) == 4
    # All items in page 2 must have seq < cursor
    for item in d2["items"]:
        assert item["seq"] < cursor

    # 3. Filter by outcome=deny
    deny_page = await client.get("/v1/decisions?outcome=deny&limit=10", headers=admin_headers)
    assert deny_page.status_code == 200
    for item in deny_page.json()["items"]:
        assert item["outcome"] == "deny"
