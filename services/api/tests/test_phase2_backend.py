"""Tests for Phase 2 backend: auth login, tools, grants enforcement,
graph snapshot, and WS streaming.
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, validate_security_configuration
from app.models.audit import AuditLog


@pytest.mark.asyncio
async def test_auth_login_and_dev_session(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify web operator login flow and development session endpoint."""
    # 1. Successful login with admin token
    login_resp = await client.post(
        "/v1/auth/login",
        json={"admin_token": "prahari-admin-dev-secret"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "session_token" in data
    assert data["session_token"].startswith("prh_sess_")
    assert data["mode"] == "admin"

    # 2. Failed login with invalid token
    fail_resp = await client.post(
        "/v1/auth/login",
        json={"admin_token": "invalid-token-1234"},
    )
    assert fail_resp.status_code == 401

    # 3. Dev session bypass
    dev_resp = await client.get("/v1/auth/dev-session")
    assert dev_resp.status_code == 200
    dev_data = dev_resp.json()
    assert dev_data["mode"] == "development-bypass"
    assert "session_token" in dev_data


@pytest.mark.asyncio
async def test_tool_registration_and_grant_enforcement(
    client: AsyncClient,
    admin_headers: dict[str, str],
    session_headers: dict[str, str],
) -> None:
    """Verify tool registration, granting, and deterministic tool grant enforcement."""
    # 1. Register tools
    t1_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.read_ticket", "server": "crm-mcp", "sensitivity": "normal"},
        headers=admin_headers,
    )
    assert t1_resp.status_code == 201
    t1_id = t1_resp.json()["id"]

    t2_resp = await client.post(
        "/v1/tools",
        json={"name": "email.send", "server": "comms-mcp", "sensitivity": "confidential"},
        headers=admin_headers,
    )
    assert t2_resp.status_code == 201
    assert t2_resp.json()["id"] is not None

    # 2. List tools with session auth
    list_resp = await client.get("/v1/tools", headers=session_headers)
    assert list_resp.status_code == 200
    tool_names = [t["name"] for t in list_resp.json()]
    assert "crm.read_ticket" in tool_names
    assert "email.send" in tool_names

    # 3. Register agent
    agent_resp = await client.post(
        "/v1/agents",
        json={"name": "Granted Bot", "owner": "Ops", "role": "support"},
        headers=admin_headers,
    )
    agent_id = agent_resp.json()["id"]
    agent_key = agent_resp.json()["api_key"]

    # 4. Grant ONLY crm.read_ticket to Granted Bot
    grant_resp = await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": t1_id},
        headers=admin_headers,
    )
    assert grant_resp.status_code == 201

    # 5. Call granted tool -> allowed
    call1 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": str(uuid4()),
            "tool": "crm.read_ticket",
            "args": {"ticket_id": "TCK-100"},
        },
    )
    assert call1.status_code == 200
    assert call1.json()["decision"] == "allow"

    # 6. Call ungranted tool email.send -> denied with tool_not_granted
    call2 = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": agent_key,
            "session_id": str(uuid4()),
            "tool": "email.send",
            "args": {"body": "test"},
        },
    )
    assert call2.status_code == 200
    res2 = call2.json()
    assert res2["decision"] == "deny"
    assert res2["reason"] == "tool_not_granted"


@pytest.mark.asyncio
async def test_graph_snapshot_endpoint(
    client: AsyncClient,
    admin_headers: dict[str, str],
    session_headers: dict[str, str],
) -> None:
    """Verify GET /v1/graph/snapshot returns topology and latest_audit_seq."""
    # 1. Unauthenticated request rejected
    unauth = await client.get("/v1/graph/snapshot")
    assert unauth.status_code == 401

    # 2. Register agent and make call
    reg = await client.post(
        "/v1/agents",
        json={"name": "Constellation Bot", "owner": "UX", "role": "support"},
        headers=admin_headers,
    )
    api_key = reg.json()["api_key"]

    await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": api_key,
            "session_id": str(uuid4()),
            "tool": "crm.read_ticket",
            "args": {"ticket_id": "TCK-SNAPSHOT"},
        },
    )

    # 3. Authenticated snapshot
    snap_resp = await client.get("/v1/graph/snapshot", headers=session_headers)
    assert snap_resp.status_code == 200
    data = snap_resp.json()
    assert "latest_audit_seq" in data
    assert data["latest_audit_seq"] >= 1
    assert "agents" in data
    assert "tools" in data
    assert "grants" in data
    assert "recent_decisions" in data
    assert len(data["recent_decisions"]) >= 1
    assert data["recent_decisions"][0]["tool"] == "crm.read_ticket"


@pytest.mark.asyncio
async def test_limits_fail_closed_behavior(
    client: AsyncClient,
    admin_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    """Verify that when LIMITS_FAIL_OPEN=False and Redis is down,
    calls are denied with limits_unavailable.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "LIMITS_FAIL_OPEN", False)

    reg = await client.post(
        "/v1/agents",
        json={"name": "Fail Closed Bot", "owner": "Risk", "role": "support"},
        headers=admin_headers,
    )
    api_key = reg.json()["api_key"]

    gw_resp = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": api_key,
            "session_id": str(uuid4()),
            "tool": "crm.read_ticket",
            "args": {"ticket_id": "TCK-123"},
        },
    )
    assert gw_resp.status_code == 200
    res = gw_resp.json()
    assert res["decision"] == "deny"
    assert res["reason"] == "limits_unavailable"

    # Verify audit event recorded as limits.unavailable
    stmt = (
        select(AuditLog)
        .where(AuditLog.payload_json["event_type"].as_string() == "limits.unavailable")
        .order_by(AuditLog.seq.desc())
    )
    result = await db_session.execute(stmt)
    entry = result.scalar_one_or_none()
    assert entry is not None
    assert entry.payload_json["reason"] == "limits_unavailable"


def test_production_startup_refuses_placeholder_secrets() -> None:
    """Verify that production startup aborts if default placeholder secrets are left in place."""
    insecure_settings = Settings(
        ENV="production",
        ADMIN_TOKEN="prahari-admin-dev-secret",
        AUDIT_HMAC_KEY="real-production-key-that-is-long-enough-12345",
        SESSION_SECRET_KEY="real-production-key-that-is-long-enough-12345",
    )
    with pytest.raises(RuntimeError, match="CRITICAL SECURITY ABORT: ADMIN_TOKEN"):
        validate_security_configuration(insecure_settings)
