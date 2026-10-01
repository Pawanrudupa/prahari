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
    from app.core.config import settings

    login_resp = await client.post(
        "/v1/auth/login",
        json={"admin_token": settings.ADMIN_TOKEN},
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
    monkeypatch.setattr("app.core.redis.redis_client", None)

    reg = await client.post(
        "/v1/agents",
        json={"name": "Fail Closed Bot", "owner": "Risk", "role": "support"},
        headers=admin_headers,
    )
    api_key = reg.json()["api_key"]
    agent_id = reg.json()["id"]

    # Explicitly grant crm.read_ticket so it passes capability grant check (Gate 4)
    t_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.read_ticket", "server": "crm-mcp", "sensitivity": "normal"},
        headers=admin_headers,
    )
    if t_resp.status_code == 201:
        tid = t_resp.json()["id"]
    else:
        l_resp = await client.get("/v1/tools", headers=admin_headers)
        tid = next(t["id"] for t in l_resp.json() if t["name"] == "crm.read_ticket")

    await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": tid},
        headers=admin_headers,
    )

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
    stmt = select(AuditLog).order_by(AuditLog.seq.desc())
    result = await db_session.execute(stmt)
    records = list(result.scalars().all())
    entry = next(
        (r for r in records if r.payload_json.get("event_type") == "limits.unavailable"),
        None,
    )
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


@pytest.mark.asyncio
async def test_grants_semantics_no_grants_no_tools(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """
    Gate 4 Verification: Strict 'no grants = no tools' semantics.
    An agent without explicit grants cannot call any tool.
    """
    # 1. Register agent with 0 grants
    reg = await client.post(
        "/v1/agents",
        json={"name": "Zero Grants Bot", "owner": "Security", "role": "support"},
        headers=admin_headers,
    )
    api_key = reg.json()["api_key"]
    agent_id = reg.json()["id"]

    # Register a tool
    tool_resp = await client.post(
        "/v1/tools",
        json={"name": "crm.secure_read", "server": "crm-mcp", "sensitivity": "normal"},
        headers=admin_headers,
    )
    tool_id = tool_resp.json()["id"]

    # 2. Call tool without grant -> denied with tool_not_granted
    call_denied = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": api_key,
            "session_id": str(uuid4()),
            "tool": "crm.secure_read",
            "args": {"id": "1"},
        },
    )
    assert call_denied.status_code == 200
    res_denied = call_denied.json()
    assert res_denied["decision"] == "deny"
    assert res_denied["reason"] == "tool_not_granted"

    # 3. Grant the tool to the agent
    grant_resp = await client.post(
        f"/v1/agents/{agent_id}/grants",
        json={"tool_id": tool_id},
        headers=admin_headers,
    )
    assert grant_resp.status_code == 201

    # 4. Call granted tool -> passes grant check
    call_allowed = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": api_key,
            "session_id": str(uuid4()),
            "tool": "crm.secure_read",
            "args": {"id": "1"},
        },
    )
    assert call_allowed.status_code == 200
    assert call_allowed.json()["reason"] != "tool_not_granted"

    # 5. Calling another ungranted tool is still denied
    call_other = await client.post(
        "/v1/gateway/tool-call",
        json={
            "agent_key": api_key,
            "session_id": str(uuid4()),
            "tool": "other.tool",
            "args": {},
        },
    )
    assert call_other.status_code == 200
    assert call_other.json()["decision"] == "deny"
    assert call_other.json()["reason"] == "tool_not_granted"


@pytest.mark.asyncio
async def test_dev_session_disabled_in_production_and_token_expiration(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Gate 5 Verification: dev-session is disabled outside development,
    and expired tokens fail verification.
    """
    from app.auth.session import create_session_token, verify_session_token
    from app.core.config import settings

    # 1. In production, dev-session is rejected with 403
    monkeypatch.setattr(settings, "ENV", "production")
    resp = await client.get("/v1/auth/dev-session")
    assert resp.status_code == 403
    assert "prohibited" in resp.json()["detail"].lower()

    # 2. Token expiration
    expired_token = create_session_token(role="admin", ttl_seconds=-10)
    assert verify_session_token(expired_token) is None

    # Using expired token against protected route returns 401
    auth_resp = await client.get(
        "/v1/tools",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert auth_resp.status_code == 401


@pytest.mark.asyncio
async def test_ws_ticket_single_use_and_expiration(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """
    Gate 6 Verification: Short-lived single-use WebSocket tickets.
    """
    from app.auth.ticket import consume_ws_ticket, create_ws_ticket

    # 1. Mint ticket via API endpoint
    ticket_resp = await client.post("/v1/auth/ws-ticket", headers=admin_headers)
    assert ticket_resp.status_code == 200
    ticket_data = ticket_resp.json()
    assert "ticket" in ticket_data
    ticket = ticket_data["ticket"]
    assert ticket.startswith("prh_wstk_")
    assert ticket_data["expires_in"] == 30

    # 2. First consumption succeeds
    payload1 = await consume_ws_ticket(ticket)
    assert payload1 is not None

    # 3. Second consumption fails (strictly single-use)
    payload2 = await consume_ws_ticket(ticket)
    assert payload2 is None

    # 4. Expired ticket fails
    expired_ticket = await create_ws_ticket({"role": "operator"}, ttl_seconds=-1)
    assert await consume_ws_ticket(expired_ticket) is None


@pytest.mark.asyncio
async def test_event_bus_queue_overflow_emits_resync() -> None:
    """
    Gate 7 Verification: When subscriber queue overflows, oldest items are dropped
    and a stream.resync event is emitted to instruct client reconciliation.
    """
    from app.events.bus import publish_event, subscribe_local_events

    # Bounded queue of maxsize=2
    async with subscribe_local_events(maxsize=2) as queue:
        # Publish 3 events to force queue overflow
        await publish_event("action.decided", {"action": "event-1"})
        await publish_event("action.decided", {"action": "event-2"})
        await publish_event("action.decided", {"action": "event-3"})

        # Read items from queue
        received = []
        while not queue.empty():
            received.append(queue.get_nowait())

        # Must have received a stream.resync notice indicating overflow
        types = [e["type"] for e in received]
        assert "stream.resync" in types
        resync = next(e for e in received if e["type"] == "stream.resync")
        assert resync["payload"]["reason"] == "queue_overflow"
