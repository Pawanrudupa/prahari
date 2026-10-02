import pytest
from httpx import AsyncClient
from services.simulator.clock import SimulationClock
from services.simulator.fixtures import (
    SYNTHETIC_FAKE_AADHAAR,
    SYNTHETIC_FAKE_EMAIL,
    SYNTHETIC_FAKE_PAN,
)
from services.simulator.scenarios import build_scenario_calls


def test_simulation_clock_advances_deterministically() -> None:
    """Verify simulation clock ticks deterministically with fixed increments."""
    clock = SimulationClock(step_seconds=2.0)
    t1 = clock.tick()
    t2 = clock.tick()
    t3 = clock.tick()

    assert t1 == "2026-09-30T12:00:00+00:00"
    assert t2 == "2026-09-30T12:00:02+00:00"
    assert t3 == "2026-09-30T12:00:04+00:00"

    clock.reset()
    assert clock.tick() == "2026-09-30T12:00:00+00:00"


def test_simulator_scenarios_deterministic() -> None:
    """Verify that same seed produces identical sequences of calls and logical payloads."""
    calls_a = build_scenario_calls(scenario="all", count=30, seed=42)
    calls_b = build_scenario_calls(scenario="all", count=30, seed=42)

    assert len(calls_a) == 30
    assert len(calls_b) == 30

    for a, b in zip(calls_a, calls_b, strict=True):
        assert a["agent"] == b["agent"]
        assert a["tool"] == b["tool"]
        assert a["args"] == b["args"]
        assert a["context"] == b["context"]


def test_simulator_does_not_send_client_declared_injection_score() -> None:
    """Invariant: Simulator must NOT declare or send client-side injection scores."""
    calls = build_scenario_calls(scenario="all", count=50, seed=99)
    for c in calls:
        # Context may contain user_prompt, but never injection_score
        assert "injection_score" not in c
        assert "injection_score" not in c.get("context", {})


def test_simulator_pii_is_strictly_synthetic_and_fake() -> None:
    """Invariant 3: Simulator PII must be obviously fake and synthetic."""
    calls = build_scenario_calls(scenario="pii", count=10, seed=42)
    for c in calls:
        body = c["args"]["body"]
        assert SYNTHETIC_FAKE_AADHAAR in body
        assert SYNTHETIC_FAKE_PAN in body
        # Real-world Aadhaar numbers are 12 digits without all zeros
        assert "0000 0000 0000" in body
        assert SYNTHETIC_FAKE_EMAIL in c["args"]["recipient"]


@pytest.mark.asyncio
async def test_simulator_provisioning_is_idempotent(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    """Verify simulator provisioning finds agents/tools by name and never adds duplicates."""
    from services.simulator.runner import SimulationRunner

    from app.core.config import settings

    runner1 = SimulationRunner(
        api_url=str(client.base_url).rstrip("/"),
        admin_token=settings.ADMIN_TOKEN,
    )
    await runner1.provision(client)

    # Check agent count
    resp1 = await client.get("/v1/agents", headers=admin_headers)
    assert resp1.status_code == 200
    agents1 = resp1.json()
    assert len(agents1) == 3
    assert set(runner1.agent_keys.keys()) == {"Support-Bot", "Finance-Agent", "DevOps-Agent"}

    # Run provisioning second time with a separate simulator runner instance
    runner2 = SimulationRunner(
        api_url=str(client.base_url).rstrip("/"),
        admin_token=settings.ADMIN_TOKEN,
    )
    await runner2.provision(client)

    # Check agent count is STILL strictly 3 (no duplicate agents created!)
    resp2 = await client.get("/v1/agents", headers=admin_headers)
    assert resp2.status_code == 200
    agents2 = resp2.json()
    assert len(agents2) == 3

    # Check that runner2 obtained valid keys for all 3 agents
    assert set(runner2.agent_keys.keys()) == {"Support-Bot", "Finance-Agent", "DevOps-Agent"}
