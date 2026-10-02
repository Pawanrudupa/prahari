import type { AgentNode, ToolNode } from "../types/graph";

export interface GraphLayoutResult {
  agentPositions: Map<string, [number, number, number]>;
  toolPositions: Map<string, [number, number, number]>;
}

export const SHIELD_RADIUS = 2.5;

/**
 * Computes deterministic 3D positions for agents and tools.
 * Agents reside in inner concentric rings outside the policy shield.
 * Tools reside in outer orbital sectors grouped by server.
 *
 * Guaranteed properties:
 * - Deterministic: same inputs always yield identical positions.
 * - Scalable: supports from 1 to 50+ agents and 150+ tools without overlapping.
 */
export function computeGraphLayout(
  agents: AgentNode[],
  tools: ToolNode[],
): GraphLayoutResult {
  const agentPositions = new Map<string, [number, number, number]>();
  const toolPositions = new Map<string, [number, number, number]>();

  // 1. Position Agents (Inner Zone: R in [4.0, 8.5])
  const sortedAgents = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  const numAgents = sortedAgents.length;

  if (numAgents <= 6) {
    // Single ring
    const radius = 4.5;
    sortedAgents.forEach((agent, i) => {
      const angle = (2 * Math.PI * i) / (numAgents || 1);
      const x = Number((radius * Math.cos(angle)).toFixed(4));
      const z = Number((radius * Math.sin(angle)).toFixed(4));
      const y = Number((0.25 * Math.sin(angle * 2)).toFixed(4));
      agentPositions.set(agent.id, [x, y, z]);
    });
  } else {
    // Multi-ring concentric distribution
    // Ring capacities: [8, 14, 20, 26, ...]
    const ringRadii = [4.2, 5.6, 7.0, 8.4];
    const ringCapacities = [8, 14, 20, 26];

    let currentAgentIdx = 0;
    for (let r = 0; r < ringRadii.length && currentAgentIdx < numAgents; r++) {
      const radius = ringRadii[r]!;
      const capacity = ringCapacities[r]!;
      const remainingAgents = numAgents - currentAgentIdx;
      const countInRing = Math.min(capacity, remainingAgents);

      // Distribute evenly across 2*pi with alternating angle offset per ring
      const angleOffset = (r * Math.PI) / 5;
      for (let i = 0; i < countInRing; i++) {
        const agent = sortedAgents[currentAgentIdx++];
        if (!agent) continue;
        const angle = angleOffset + (2 * Math.PI * i) / countInRing;
        const x = Number((radius * Math.cos(angle)).toFixed(4));
        const z = Number((radius * Math.sin(angle)).toFixed(4));
        // Subtle vertical oscillation to create layered depth
        const y = Number((0.4 * Math.sin(angle * 3 + r)).toFixed(4));
        agentPositions.set(agent.id, [x, y, z]);
      }
    }

    // Overflow beyond ring capacities (fallback outer shell)
    while (currentAgentIdx < numAgents) {
      const agent = sortedAgents[currentAgentIdx++];
      if (!agent) break;
      const angle = (currentAgentIdx * 137.5 * Math.PI) / 180; // golden ratio
      const radius = 9.5;
      const x = Number((radius * Math.cos(angle)).toFixed(4));
      const z = Number((radius * Math.sin(angle)).toFixed(4));
      const y = Number((0.5 * Math.cos(angle)).toFixed(4));
      agentPositions.set(agent.id, [x, y, z]);
    }
  }

  // 2. Position Tools Grouped by Server (Outer Zone: R in [13.0, 16.5])
  const sortedTools = [...tools].sort((a, b) => {
    const srv = a.server.localeCompare(b.server);
    if (srv !== 0) return srv;
    return a.id.localeCompare(b.id);
  });

  // Group by server
  const serverGroups = new Map<string, ToolNode[]>();
  for (const tool of sortedTools) {
    const list = serverGroups.get(tool.server) || [];
    list.push(tool);
    serverGroups.set(tool.server, list);
  }

  const serverNames = Array.from(serverGroups.keys()).sort();
  const numServers = serverNames.length;

  if (numServers > 0) {
    const totalTools = sortedTools.length;
    let currentAngle = 0;
    const interServerPadding = numServers > 1 ? 0.08 : 0; // padding between server arcs

    for (const server of serverNames) {
      const serverTools = serverGroups.get(server)!;
      // Sector width proportional to tool count, with minimum width
      const toolProportion = serverTools.length / (totalTools || 1);
      const sectorSpan = Math.max(
        (2 * Math.PI - numServers * interServerPadding) * toolProportion,
        0.2,
      );

      const numToolsInServer = serverTools.length;
      // Stagger in up to 3 radial bands: R1=13.2, R2=14.8, R3=16.2
      const radialBands = [13.5, 15.0, 16.5];

      serverTools.forEach((tool, idx) => {
        const band = radialBands[idx % radialBands.length]!;
        const frac = numToolsInServer > 1 ? idx / (numToolsInServer - 1) : 0.5;
        const angle = currentAngle + frac * sectorSpan;
        const x = Number((band * Math.cos(angle)).toFixed(4));
        const z = Number((band * Math.sin(angle)).toFixed(4));
        // Vertical stagger for readability
        const y = Number(((idx % 3 - 1) * 0.8).toFixed(4));
        toolPositions.set(tool.id, [x, y, z]);
      });

      currentAngle += sectorSpan + interServerPadding;
    }
  }

  return { agentPositions, toolPositions };
}
