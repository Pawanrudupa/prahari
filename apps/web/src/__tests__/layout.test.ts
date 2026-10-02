import { describe, it, expect } from "vitest";
import { computeGraphLayout, SHIELD_RADIUS } from "../utils/layout";
import type { AgentNode, ToolNode } from "../types/graph";

describe("Graph Layout Engine", () => {
  it("produces deterministic positions for identical inputs", () => {
    const agents: AgentNode[] = [
      { id: "ag-2", name: "Finance-Agent", role: "finance", owner: "Ops", status: "active" },
      { id: "ag-1", name: "Support-Bot", role: "support", owner: "Ops", status: "active" },
    ];
    const tools: ToolNode[] = [
      { id: "tl-2", name: "email.send", server: "email-mcp", sensitivity: "normal" },
      { id: "tl-1", name: "crm.read", server: "crm-mcp", sensitivity: "normal" },
    ];

    const run1 = computeGraphLayout(agents, tools);
    const run2 = computeGraphLayout(agents, tools);

    expect(run1.agentPositions.get("ag-1")).toEqual(run2.agentPositions.get("ag-1"));
    expect(run1.agentPositions.get("ag-2")).toEqual(run2.agentPositions.get("ag-2"));
    expect(run1.toolPositions.get("tl-1")).toEqual(run2.toolPositions.get("tl-1"));
    expect(run1.toolPositions.get("tl-2")).toEqual(run2.toolPositions.get("tl-2"));
  });

  it("scales to stress load (50 agents + 150 tools) with non-overlapping, valid coordinates", () => {
    const agents: AgentNode[] = Array.from({ length: 50 }, (_, i) => ({
      id: `agent-${String(i).padStart(3, "0")}`,
      name: `Agent-${i}`,
      role: "agent",
      owner: "Ops",
      status: "active",
    }));

    const servers = ["crm-mcp", "email-mcp", "payments-mcp", "infra-mcp", "billing-mcp"];
    const tools: ToolNode[] = Array.from({ length: 150 }, (_, i) => ({
      id: `tool-${String(i).padStart(3, "0")}`,
      name: `tool.${i}`,
      server: servers[i % servers.length]!,
      sensitivity: i % 5 === 0 ? "high" : "normal",
    }));

    const layout = computeGraphLayout(agents, tools);

    expect(layout.agentPositions.size).toBe(50);
    expect(layout.toolPositions.size).toBe(150);

    // Agents reside strictly outside the shield (R > SHIELD_RADIUS) and in the inner zone (R <= 10.5)
    for (const [, pos] of layout.agentPositions.entries()) {
      const radius = Math.hypot(pos[0], pos[2]);
      expect(radius).toBeGreaterThan(SHIELD_RADIUS);
      expect(radius).toBeLessThanOrEqual(10.5);
      expect(Number.isFinite(pos[0])).toBe(true);
      expect(Number.isFinite(pos[1])).toBe(true);
      expect(Number.isFinite(pos[2])).toBe(true);
    }

    // Tools reside strictly in the outer zone (R >= 13.0 and R <= 17.5)
    for (const [, pos] of layout.toolPositions.entries()) {
      const radius = Math.hypot(pos[0], pos[2]);
      expect(radius).toBeGreaterThanOrEqual(13.0);
      expect(radius).toBeLessThanOrEqual(17.5);
      expect(Number.isFinite(pos[0])).toBe(true);
      expect(Number.isFinite(pos[1])).toBe(true);
      expect(Number.isFinite(pos[2])).toBe(true);
    }

    // Check minimum distance between agents (no identical collisions)
    const agentPosArray = Array.from(layout.agentPositions.values());
    for (let i = 0; i < agentPosArray.length; i++) {
      for (let j = i + 1; j < agentPosArray.length; j++) {
        const p1 = agentPosArray[i]!;
        const p2 = agentPosArray[j]!;
        const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]);
        expect(dist).toBeGreaterThan(0.2); // minimum clearance
      }
    }
  });

  it("groups tools by server into coherent angular sectors", () => {
    const tools: ToolNode[] = [
      { id: "tl-a1", name: "crm.read", server: "crm", sensitivity: "normal" },
      { id: "tl-a2", name: "crm.write", server: "crm", sensitivity: "normal" },
      { id: "tl-b1", name: "infra.reboot", server: "infra", sensitivity: "normal" },
      { id: "tl-b2", name: "infra.scale", server: "infra", sensitivity: "normal" },
    ];

    const layout = computeGraphLayout([], tools);

    const posCrm1 = layout.toolPositions.get("tl-a1")!;
    const posCrm2 = layout.toolPositions.get("tl-a2")!;
    const posInfra1 = layout.toolPositions.get("tl-b1")!;

    const angleCrm1 = Math.atan2(posCrm1[2], posCrm1[0]);
    const angleCrm2 = Math.atan2(posCrm2[2], posCrm2[0]);
    const angleInfra1 = Math.atan2(posInfra1[2], posInfra1[0]);

    // Tools in the same server are close in angle
    const crmAngleDiff = Math.abs(angleCrm1 - angleCrm2);
    const crossAngleDiff = Math.abs(angleCrm1 - angleInfra1);

    expect(crmAngleDiff).toBeLessThan(crossAngleDiff);
  });
});
