"""Simulation execution runner provisioning agents and dispatching tool calls."""

import asyncio
import contextlib
from typing import Any
from uuid import uuid4

import httpx
from services.simulator.clock import SimulationClock
from services.simulator.fixtures import AGENTS_SPEC, CANONICAL_GRANTS, TOOLS_SPEC
from services.simulator.scenarios import build_scenario_calls


class SimulationRunner:
    """Orchestrates provisioning and execution of simulated agent traffic."""

    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        admin_token: str = "prahari-admin-dev-secret",
        seed: int = 42,
        rate: float = 2.0,
        clock: SimulationClock | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.admin_token = admin_token
        self.seed = seed
        self.rate = rate
        self.clock = clock or SimulationClock()
        self.agent_keys: dict[str, str] = {}  # agent_name -> api_key
        self.agent_ids: dict[str, str] = {}   # agent_name -> id
        self.tool_ids: dict[str, str] = {}    # tool_name -> id
        self.decisions_log: list[dict[str, Any]] = []

    def reset(self) -> None:
        """Reset runner state and clock for deterministic comparison runs."""
        self.clock.reset()
        self.decisions_log.clear()

    async def reset_limits(self) -> None:
        """Reset in-memory and Redis limit counters between simulation runs."""
        import os
        with contextlib.suppress(Exception):
            from app.limits.service import in_memory_tracker
            in_memory_tracker.reset()

        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            with contextlib.suppress(Exception):
                import redis.asyncio as aioredis
                r = aioredis.from_url(redis_url)
                keys = await r.keys("prahari:limit:*")
                if keys:
                    await r.delete(*keys)
                await r.aclose()

    async def provision(self, client: httpx.AsyncClient) -> None:
        """Provision canonical agents and tools via the Admin API."""
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

        # 1. Provision standard tools
        for tool_spec in TOOLS_SPEC:
            if tool_spec["name"] in self.tool_ids:
                continue
            try:
                resp = await client.post(
                    f"{self.api_url}/v1/tools",
                    json=tool_spec,
                    headers=admin_headers,
                )
                if resp.status_code in (200, 201):
                    self.tool_ids[tool_spec["name"]] = resp.json()["id"]
                elif resp.status_code == 409:
                    list_resp = await client.get(f"{self.api_url}/v1/tools", headers=admin_headers)
                    if list_resp.status_code == 200:
                        for t in list_resp.json():
                            self.tool_ids[t["name"]] = t["id"]
            except Exception:
                pass

        # 2. Provision canonical agents
        for agent_spec in AGENTS_SPEC:
            if agent_spec["name"] in self.agent_keys:
                continue
            resp = await client.post(
                f"{self.api_url}/v1/agents",
                json=agent_spec,
                headers=admin_headers,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                self.agent_keys[agent_spec["name"]] = data["api_key"]
                self.agent_ids[agent_spec["name"]] = data["id"]

        # 3. Provision canonical tool capability grants (enforces no-grants-no-tools invariant)
        for agent_name, tool_names in CANONICAL_GRANTS.items():
            agent_id = self.agent_ids.get(agent_name)
            if not agent_id:
                continue
            for tool_name in tool_names:
                tool_id = self.tool_ids.get(tool_name)
                if not tool_id:
                    continue
                with contextlib.suppress(Exception):
                    await client.post(
                        f"{self.api_url}/v1/agents/{agent_id}/grants",
                        json={"tool_id": tool_id},
                        headers=admin_headers,
                    )

    async def provision_stress_nodes(
        self,
        client: httpx.AsyncClient,
        target_nodes: int = 200,
    ) -> None:
        """
        Stress mode provisioning: provisions nodes up to target count (e.g. 200 nodes).
        Split: ~50 agents + ~150 tools.
        """
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        num_agents = min(50, target_nodes // 4)
        num_tools = target_nodes - num_agents

        for i in range(len(self.agent_keys), num_agents):
            name = f"Stress-Agent-{i:03d}"
            resp = await client.post(
                f"{self.api_url}/v1/agents",
                json={"name": name, "owner": "Stress Team", "role": "support"},
                headers=admin_headers,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                self.agent_keys[name] = data["api_key"]
                self.agent_ids[name] = data["id"]

        for i in range(len(self.tool_ids), num_tools):
            name = f"stress.tool_{i:03d}"
            resp = await client.post(
                f"{self.api_url}/v1/tools",
                json={"name": name, "server": "stress-server", "sensitivity": "normal"},
                headers=admin_headers,
            )
            if resp.status_code in (200, 201):
                self.tool_ids[name] = resp.json()["id"]

    async def execute_call(
        self,
        client: httpx.AsyncClient,
        call_spec: dict[str, Any],
        session_id: str,
    ) -> dict[str, Any]:
        """Dispatch a single tool call to the gateway and log decision."""
        agent_name = call_spec["agent"]
        api_key = self.agent_keys.get(agent_name)
        if not api_key:
            return {"error": f"Agent {agent_name} not provisioned"}

        req_body = {
            "agent_key": api_key,
            "session_id": session_id,
            "tool": call_spec["tool"],
            "args": call_spec["args"],
            "purpose": call_spec.get("purpose", ""),
            "context": call_spec.get("context", {}),
        }

        # Advance virtual clock deterministically
        self.clock.tick()

        resp = await client.post(f"{self.api_url}/v1/gateway/tool-call", json=req_body)
        if resp.status_code == 200:
            data = resp.json()
        else:
            data = {"decision": "error", "reason": resp.text}

        record = {
            "agent": agent_name,
            "tool": call_spec["tool"],
            "decision": data.get("decision", "unknown"),
            "rule_id": data.get("rule_id"),
            "reason": data.get("reason"),
        }
        self.decisions_log.append(record)
        return record

    async def run(
        self,
        scenario: str = "all",
        count: int = 20,
        stress: bool = False,
        client: httpx.AsyncClient | None = None,
    ) -> list[dict[str, Any]]:
        """Run complete scenario simulation."""
        self.reset()
        if client is not None:
            await self._run_with_client(client, scenario, count, stress)
        else:
            async with httpx.AsyncClient(timeout=30.0) as c:
                await self._run_with_client(c, scenario, count, stress)

        return self.decisions_log

    async def _run_with_client(
        self,
        client: httpx.AsyncClient,
        scenario: str,
        count: int,
        stress: bool,
    ) -> None:
        await self.provision(client)
        await self.reset_limits()

        if stress:
            await self.provision_stress_nodes(client, target_nodes=200)

        calls = build_scenario_calls(scenario=scenario, count=count, seed=self.seed)
        session_id = str(uuid4())

        for call in calls:
            await self.execute_call(client, call, session_id)
            if self.rate > 0:
                delay = 1.0 / self.rate
                await asyncio.sleep(min(delay, 0.05))
