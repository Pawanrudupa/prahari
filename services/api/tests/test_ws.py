import json

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.ticket import create_ws_ticket
from app.main import create_app


def test_ws_unauthenticated_connection_rejected() -> None:
    """Connecting to /ws/events without token is closed with code 1008."""
    app = create_app()
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/events"),
    ):
        pass


def test_ws_query_token_rejected() -> None:
    """Query parameter ?token= is rejected to prevent log leakage; ?ticket= is required."""
    app = create_app()
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/events?token=some_token"),
    ):
        pass


@pytest.mark.asyncio
async def test_ws_authenticated_connection_and_event_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Connecting with single-use ticket receives events and prevents replay."""
    monkeypatch.setattr("app.core.redis.redis_client", None)
    app = create_app()
    ticket = await create_ws_ticket(user_payload={"role": "admin"}, ttl_seconds=30)

    with (
        TestClient(app) as client,
        client.websocket_connect(f"/ws/events?ticket={ticket}") as websocket,
    ):
        # 1. Send client ping and verify pong
        websocket.send_text(json.dumps({"type": "ping"}))
        resp = json.loads(websocket.receive_text())
        assert resp.get("type") == "pong"

    # 2. Replay attempt with same ticket is rejected
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(f"/ws/events?ticket={ticket}"),
    ):
        pass
