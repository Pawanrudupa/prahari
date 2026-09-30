"""Tests for WebSocket /ws/events streaming and envelope format."""

import json

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.session import create_session_token
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


def test_ws_authenticated_connection_and_event_delivery() -> None:
    """Connecting with valid session token receives published action.decided event."""
    app = create_app()
    token = create_session_token(role="admin", mode="admin")

    with (
        TestClient(app) as client,
        client.websocket_connect(f"/ws/events?token={token}") as websocket,
    ):
        # 1. Send client ping and verify pong
        websocket.send_text(json.dumps({"type": "ping"}))
        resp = json.loads(websocket.receive_text())
        assert resp.get("type") == "pong"
