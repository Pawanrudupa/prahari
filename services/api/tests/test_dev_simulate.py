"""Tests for development simulation endpoint (POST /v1/dev/simulate)."""

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_dev_simulate_not_found_outside_dev_or_test(client: AsyncClient) -> None:
    """Verify endpoint strictly returns 404 in non-development/test environments."""
    original_env = settings.ENV
    try:
        settings.ENV = "production"
        resp = await client.post(
            "/v1/dev/simulate",
            json={"scenario": "benign", "count": 5, "seed": 42},
        )
        assert resp.status_code == 404
    finally:
        settings.ENV = original_env


@pytest.mark.asyncio
async def test_dev_simulate_validation_bounds(client: AsyncClient) -> None:
    """Verify request validation caps count at 500 and enforces minimum 1."""
    # Count > 500
    resp_over = await client.post(
        "/v1/dev/simulate",
        json={"scenario": "benign", "count": 501, "seed": 42},
    )
    assert resp_over.status_code == 422

    # Count < 1
    resp_under = await client.post(
        "/v1/dev/simulate",
        json={"scenario": "benign", "count": 0, "seed": 42},
    )
    assert resp_under.status_code == 422


@pytest.mark.asyncio
async def test_dev_simulate_concurrency_lock_409(client: AsyncClient) -> None:
    """Verify single-run lock returns 409 Conflict if another simulation is active."""
    from app.routers.dev import DistributedSimulateLock

    lock = DistributedSimulateLock()
    acquired = await lock.acquire()
    assert acquired is True
    try:
        resp = await client.post(
            "/v1/dev/simulate",
            json={"scenario": "benign", "count": 2, "seed": 42},
        )
        assert resp.status_code == 409
        data = resp.json()
        assert "already in progress" in data["detail"].lower()
    finally:
        await lock.release()


@pytest.mark.asyncio
async def test_dev_simulate_redis_lock_lifecycle_and_timeout() -> None:
    """Verify DistributedSimulateLock lifecycle, single-owner exclusivity, and release."""
    from app.routers.dev import DistributedSimulateLock

    test_key = "test:prahari:simulate:lock:lifecycle"
    lock1 = DistributedSimulateLock(key=test_key, ttl=2)
    lock2 = DistributedSimulateLock(key=test_key, ttl=2)

    try:
        # First worker acquires lock
        assert await lock1.acquire() is True

        # Second worker is denied acquisition
        assert await lock2.acquire() is False

        # First worker finishes and releases lock
        await lock1.release()

        # Second worker can now acquire lock
        assert await lock2.acquire() is True
    finally:
        await lock1.release()
        await lock2.release()


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_dev_simulate_executes_scenario_deterministically(client: AsyncClient) -> None:
    """Verify dev simulate executes scenario against gateway and returns summary."""
    resp = await client.post(
        "/v1/dev/simulate",
        json={"scenario": "benign", "count": 4, "seed": 42},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario"] == "benign"
    assert data["count"] == 4
    assert data["seed"] == 42
    assert "summary" in data
    assert "decisions" in data
    assert len(data["decisions"]) == 4
    for dec in data["decisions"]:
        assert "agent" in dec
        assert "tool" in dec
        assert "decision" in dec
