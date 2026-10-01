"""Tests for rate limiting, loop braking, and spend caps."""

from uuid import uuid4

import pytest

from app.limits.service import (
    InMemoryLimitTracker,
    check_limits,
    compute_call_signature,
)
from app.policy.schemas import PolicyLimit

pytestmark = [pytest.mark.postgres]


def test_stable_call_signature_deterministic() -> None:
    """Verify call signature hash is stable across dictionary key order variations."""
    agent_id = uuid4()
    args1 = {"b": 2, "a": 1, "nested": {"y": "val", "x": 10}}
    args2 = {"a": 1, "nested": {"x": 10, "y": "val"}, "b": 2}

    sig1 = compute_call_signature(agent_id, "test.tool", args1)
    sig2 = compute_call_signature(agent_id, "test.tool", args2)

    assert sig1 == sig2
    assert len(sig1) == 64  # SHA-256


def test_call_signature_changes_with_tool_or_args() -> None:
    """Verify differing tools or arguments generate distinct signatures."""
    agent_id = uuid4()
    sig1 = compute_call_signature(agent_id, "tool.one", {"a": 1})
    sig2 = compute_call_signature(agent_id, "tool.two", {"a": 1})
    sig3 = compute_call_signature(agent_id, "tool.one", {"a": 2})

    assert sig1 != sig2
    assert sig1 != sig3


def test_in_memory_rate_limit_calls_per_minute() -> None:
    """Verify rate limit trips after exceeding max_calls_per_min."""
    tracker = InMemoryLimitTracker()
    agent_id = str(uuid4())
    limit = PolicyLimit(id="L1", max_calls_per_min=5)

    for _ in range(5):
        res = tracker.check_and_increment(agent_id, "sig1", limit)
        assert res.allowed is True

    # 6th call should trip limit
    res6 = tracker.check_and_increment(agent_id, "sig1", limit)
    assert res6.allowed is False
    assert "Rate limit exceeded" in str(res6.reason)


def test_in_memory_loop_brake_repeat_same_call() -> None:
    """Verify runaway loop brake trips after exceeding max_repeat_same_call."""
    tracker = InMemoryLimitTracker()
    agent_id = str(uuid4())
    limit = PolicyLimit(id="L2", max_repeat_same_call=3)
    sig = "looping_signature_abc"

    for _ in range(3):
        res = tracker.check_and_increment(agent_id, sig, limit)
        assert res.allowed is True

    # 4th identical call trips loop brake
    res4 = tracker.check_and_increment(agent_id, sig, limit)
    assert res4.allowed is False
    assert "Loop detected" in str(res4.reason)


def test_in_memory_daily_spend_limit() -> None:
    """Verify daily INR spend cap triggers when budget is exhausted."""
    tracker = InMemoryLimitTracker()
    agent_id = str(uuid4())
    limit = PolicyLimit(id="L3", max_spend_inr_per_day=500.0)

    # Spend 300
    res1 = tracker.check_and_increment(agent_id, "sig_a", limit, spend_amount=300.0)
    assert res1.allowed is True

    # Spend another 150 (total 450 <= 500)
    res2 = tracker.check_and_increment(agent_id, "sig_b", limit, spend_amount=150.0)
    assert res2.allowed is True

    # Spend 100 (total 550 > 500) -> trip
    res3 = tracker.check_and_increment(agent_id, "sig_c", limit, spend_amount=100.0)
    assert res3.allowed is False
    assert "Daily spend cap exceeded" in str(res3.reason)


@pytest.mark.asyncio
async def test_check_limits_async_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify check_limits falls back to in-memory tracking when LIMITS_FAIL_OPEN is True."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "LIMITS_FAIL_OPEN", True)
    agent_id = uuid4()
    limits = [
        PolicyLimit(id="L1", max_calls_per_min=10),
        PolicyLimit(id="L2", max_repeat_same_call=2),
    ]

    # First call
    r1 = await check_limits(None, agent_id, "tool.x", {"id": 1}, limits)
    assert r1.allowed is True
    assert r1.degraded is True

    # Second call
    r2 = await check_limits(None, agent_id, "tool.x", {"id": 1}, limits)
    assert r2.allowed is True

    # Third identical call trips loop detector
    r3 = await check_limits(None, agent_id, "tool.x", {"id": 1}, limits)
    assert r3.allowed is False
    assert "Loop detected" in str(r3.reason)


@pytest.mark.asyncio
async def test_check_limits_fail_closed_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify check_limits fails closed when LIMITS_FAIL_OPEN=False and Redis is down."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "LIMITS_FAIL_OPEN", False)
    agent_id = uuid4()
    limits = [PolicyLimit(id="L1", max_calls_per_min=10)]

    res = await check_limits(None, agent_id, "tool.y", {}, limits)
    assert res.allowed is False
    assert res.degraded is True
    assert res.reason == "limits_unavailable"
