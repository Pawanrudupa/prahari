import { describe, it, expect } from "vitest";
import { computeP95Latency } from "../components/hud/KpiStrip";
import { resolveAgentDisplayName } from "../components/hud/LiveEventFeed";

describe("KPI p95 Latency Buffer Computation", () => {
  it("returns '—' when sample count is less than minimum (5)", () => {
    expect(computeP95Latency([])).toBe("—");
    expect(computeP95Latency([12.5])).toBe("—");
    expect(computeP95Latency([10, 20, 30])).toBe("—");
    expect(computeP95Latency([15.2, 18.4, 21.0, 19.8])).toBe("—");
  });

  it("computes p95 latency accurately once 5 or more samples are available", () => {
    const latencies = [10, 15, 20, 25, 30]; // 5 samples, 95th percentile index is 4 -> 30
    expect(computeP95Latency(latencies, 5)).toBe("30.0ms");

    const samples20 = Array.from({ length: 20 }, (_, i) => (i + 1) * 2); // 2, 4, ..., 40
    // 20 * 0.95 = 19 (index 19 is 40)
    expect(computeP95Latency(samples20, 5)).toBe("40.0ms");
  });

  it("handles unsorted rolling window arrays deterministically", () => {
    const unsorted = [85.4, 12.1, 45.0, 22.3, 19.8, 24.5, 99.1, 15.0, 18.2, 21.0];
    const res = computeP95Latency(unsorted, 5);
    expect(res).toBe("99.1ms");
  });
});

describe("Event Feed Agent Name Resolution", () => {
  const agentsMap = new Map([
    [
      "a1111111-1111-1111-1111-111111111111",
      { name: "Support-Triage-Bot", tags: ["core"] },
    ],
    [
      "b2222222-2222-2222-2222-222222222222",
      { name: "Finance-Payroll-Bot", tags: ["core"] },
    ],
  ]);

  it("uses human-readable agent_name when declared in the event payload", () => {
    const event = {
      agent_id: "a1111111-1111-1111-1111-111111111111",
      agent_name: "Support-Triage-Bot",
    };
    expect(resolveAgentDisplayName(event, agentsMap)).toBe("Support-Triage-Bot");
  });

  it("falls back to agent lookup by UUID when agent_name is missing or null", () => {
    const event = {
      agent_id: "b2222222-2222-2222-2222-222222222222",
      agent_name: null,
    };
    expect(resolveAgentDisplayName(event, agentsMap)).toBe("Finance-Payroll-Bot");
  });

  it("resolves name when agent_name in event is inadvertently set to raw UUID", () => {
    const event = {
      agent_id: "a1111111-1111-1111-1111-111111111111",
      agent_name: "a1111111-1111-1111-1111-111111111111",
    };
    expect(resolveAgentDisplayName(event, agentsMap)).toBe("Support-Triage-Bot");
  });

  it("NEVER outputs a truncated UUID when agent is unresolvable", () => {
    const unknownEvent = {
      agent_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      agent_name: null,
    };
    const name = resolveAgentDisplayName(unknownEvent, agentsMap);
    expect(name).not.toContain("ffffffff");
    expect(name).toBe("Autonomous Agent");
  });
});
