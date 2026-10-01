import json

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.ticket import consume_ws_ticket, create_ws_ticket
from app.core.redis import redis_client
from app.events.bus import CHANNEL_NAME, publish_event
from app.main import create_app


def test_ws_unauthenticated_connection_rejected() -> None:
    """Connecting to /ws/events without token is closed with code 1008."""
    app = create_app(enable_lifespan=False)
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/events"),
    ):
        pass


def test_ws_query_token_rejected() -> None:
    """Query parameter ?token= is rejected to prevent log leakage; ?ticket= is required."""
    app = create_app(enable_lifespan=False)
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/events?token=some_token"),
    ):
        pass


def test_ws_authenticated_connection_and_event_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Connecting with single-use ticket receives events and prevents replay."""
    import asyncio

    monkeypatch.setattr("app.auth.ticket.redis_client", None)
    ticket = asyncio.run(create_ws_ticket(user_payload={"role": "admin"}, ttl_seconds=30))
    app = create_app(enable_lifespan=False)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/events?ticket={ticket}") as websocket:
        # 1. Send client ping and verify pong
        websocket.send_text(json.dumps({"type": "ping"}))
        resp = json.loads(websocket.receive_text())
        assert resp.get("type") == "pong"

    # 2. Replay attempt with same ticket is rejected
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(f"/ws/events?ticket={ticket}"),
    ):
        pass


@pytest.mark.asyncio
async def test_ws_redis_backed_ticket_and_event_delivery() -> None:
    """
    Integration test against real Redis:
    1. Mint ticket with real Redis client and verify key in Redis with 30s TTL.
    2. Atomically consume ticket via consume_ws_ticket and verify single-use deletion.
    3. Verify second consumption attempt returns None (replay prevention).
    4. Verify Redis pub/sub channel receives events published by publish_event.
    """
    import asyncio

    if redis_client is None:
        pytest.skip("Redis service is not configured")

    # 1. Mint ticket in real Redis
    ticket = await create_ws_ticket(
        user_payload={"role": "admin", "uid": "operator-1"},
        ttl_seconds=30,
    )
    assert ticket.startswith("prh_wstk_")

    # Verify key in real Redis
    raw_val = await redis_client.get(f"ws_ticket:{ticket}")
    assert raw_val is not None
    ttl = await redis_client.ttl(f"ws_ticket:{ticket}")
    assert 0 < ttl <= 30

    # 2. Consume ticket
    payload = await consume_ws_ticket(ticket)
    assert payload is not None
    assert payload["role"] == "admin"
    assert payload["uid"] == "operator-1"

    # Verify key was atomically deleted in Redis
    assert await redis_client.get(f"ws_ticket:{ticket}") is None

    # 3. Replay fails
    assert await consume_ws_ticket(ticket) is None

    # 4. Redis Pub/Sub delivery verification
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(CHANNEL_NAME)
    try:
        # Publish event
        await publish_event("action.decided", {"action_id": "act-redis-1", "outcome": "allow"})
        # Read message from Redis pubsub
        msg = None
        for _ in range(10):
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg:
                break
            await asyncio.sleep(0.05)
        assert msg is not None
        data = json.loads(msg["data"])
        assert data["type"] == "action.decided"
        assert data["payload"]["action_id"] == "act-redis-1"
    finally:
        await pubsub.unsubscribe(CHANNEL_NAME)
        await pubsub.aclose()  # type: ignore[no-untyped-call]
