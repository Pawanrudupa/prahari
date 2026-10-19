import { create } from "zustand";
import type {
  AgentNode,
  DecisionEvent,
  GrantEdge,
  GraphSnapshot,
  ToolNode,
} from "../types/graph";

const MAX_DECISIONS_RING_BUFFER = 1000;

interface GraphState {
  agents: Map<string, AgentNode>;
  tools: Map<string, ToolNode>;
  grants: GrantEdge[];
  decisions: DecisionEvent[];
  latestAuditSeq: number;
  selectedNodeId: string | null;
  selectedDecisionId: string | null;
  hoveredNodeId: string | null;
  webglLost: boolean;
  pendingEscalations: Map<string, number>;
  liveEventListener: ((event: DecisionEvent) => void) | null;
  cameraPreset: "overview" | "follow_agent" | "top_down";

  applySnapshot: (snapshot: GraphSnapshot) => void;
  applyEvent: (event: DecisionEvent) => boolean;
  selectNode: (id: string | null) => void;
  selectDecision: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  setWebglLost: (lost: boolean) => void;
  setCameraPreset: (preset: "overview" | "follow_agent" | "top_down") => void;
  resolveEscalation: (agentId: string) => void;
  clearEscalations: () => void;
  setLiveEventListener: (fn: ((event: DecisionEvent) => void) | null) => void;
  clear: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  agents: new Map(),
  tools: new Map(),
  grants: [],
  decisions: [],
  latestAuditSeq: 0,
  selectedNodeId: null,
  selectedDecisionId: null,
  hoveredNodeId: null,
  webglLost: false,
  pendingEscalations: new Map(),
  liveEventListener: null,
  cameraPreset: "overview",

  applySnapshot: (snapshot: GraphSnapshot) => {
    const agentsMap = new Map<string, AgentNode>();
    for (const a of snapshot.agents) {
      agentsMap.set(a.id, {
        ...a,
        activityCount: 0,
        riskScore: 0.0,
        pendingEscalations: get().pendingEscalations.get(a.id) || 0,
      });
    }

    const toolsMap = new Map<string, ToolNode>();
    for (const t of snapshot.tools) {
      toolsMap.set(t.id, t);
    }

    // Merge recent decisions, deduplicating by normalized decision_id
    const existingIds = new Set(get().decisions.map((d) => d.decision_id));
    const mergedDecisions = [...get().decisions];

    for (const raw of snapshot.recent_decisions) {
      const decId =
        raw.decision_id ||
        raw.action_id ||
        `snapshot-seq-${raw.audit_seq}`;
      const toolId = raw.tool_id || (raw as unknown as { tool?: string }).tool || "unknown";
      const agent = agentsMap.get(raw.agent_id);
      const agentName = raw.agent_name || agent?.name || raw.agent_id;
      const riskScore =
        raw.risk_score ??
        (raw.outcome === "escalate" ? 0.85 : raw.outcome === "deny" ? 0.95 : 0.0);

      const d: DecisionEvent = {
        decision_id: decId,
        action_id: raw.action_id || decId,
        agent_id: raw.agent_id,
        agent_name: agentName,
        tool_id: toolId,
        outcome: raw.outcome,
        rule_id: raw.rule_id ?? null,
        risk_score: riskScore,
        session_id: raw.session_id ?? null,
        parent_action_id: raw.parent_action_id ?? null,
        audit_seq: raw.audit_seq,
        data_classes: raw.data_classes ?? [],
        latency_ms: raw.latency_ms ?? 0,
        timestamp: raw.timestamp,
      };

      if (!existingIds.has(decId)) {
        existingIds.add(decId);
        mergedDecisions.push(d);

        // Update agent activity count & risk score
        if (agent) {
          agent.activityCount = (agent.activityCount || 0) + 1;
          agent.riskScore = Math.max(agent.riskScore || 0, d.risk_score);
        }
      }
    }

    // Sort by audit_seq ascending and truncate to ring buffer size
    mergedDecisions.sort((a, b) => a.audit_seq - b.audit_seq);
    const boundedDecisions =
      mergedDecisions.length > MAX_DECISIONS_RING_BUFFER
        ? mergedDecisions.slice(mergedDecisions.length - MAX_DECISIONS_RING_BUFFER)
        : mergedDecisions;

    const newLatestSeq = Math.max(get().latestAuditSeq, snapshot.latest_audit_seq);

    // Note: snapshot recent decisions do NOT trigger liveEventListener animation!
    set({
      agents: agentsMap,
      tools: toolsMap,
      grants: snapshot.grants,
      decisions: boundedDecisions,
      latestAuditSeq: newLatestSeq,
    });
  },

  applyEvent: (event: DecisionEvent): boolean => {
    const state = get();

    // 1. Strict sequence ordering: drop event if audit_seq is not newer than baseline
    if (event.audit_seq <= state.latestAuditSeq) {
      return false;
    }

    // 2. Deduplicate: check if already present
    if (state.decisions.some((d) => d.decision_id === event.decision_id)) {
      return false;
    }

    // 3. Update agent stats and pending escalations
    const updatedAgents = new Map(state.agents);
    const updatedPendingEscalations = new Map(state.pendingEscalations);

    // Find agent by UUID or name
    let targetAgentId = event.agent_id;
    let agent = updatedAgents.get(targetAgentId);
    if (!agent) {
      for (const [id, a] of updatedAgents.entries()) {
        if (a.name === event.agent_id || (event.agent_name && a.name === event.agent_name)) {
          targetAgentId = id;
          agent = a;
          break;
        }
      }
    }

    const isEscalate = event.outcome === "escalate";
    const currentPending = updatedPendingEscalations.get(targetAgentId) || 0;
    const newPending = isEscalate ? currentPending + 1 : currentPending;
    if (isEscalate) {
      updatedPendingEscalations.set(targetAgentId, newPending);
    }

    if (agent) {
      updatedAgents.set(targetAgentId, {
        ...agent,
        activityCount: (agent.activityCount || 0) + 1,
        riskScore: Math.max(agent.riskScore || 0, event.risk_score),
        pendingEscalations: newPending,
        escalationTintActive: newPending > 0 || isEscalate,
        lastOutcome: event.outcome,
        lastOutcomeTime: Date.now(),
      });
    }

    // 4. Append to ring buffer
    const newDecisions = [...state.decisions, event];
    const boundedDecisions =
      newDecisions.length > MAX_DECISIONS_RING_BUFFER
        ? newDecisions.slice(newDecisions.length - MAX_DECISIONS_RING_BUFFER)
        : newDecisions;

    set({
      agents: updatedAgents,
      decisions: boundedDecisions,
      latestAuditSeq: Math.max(state.latestAuditSeq, event.audit_seq),
      pendingEscalations: updatedPendingEscalations,
    });

    // 5. Notify live event listener for 3D animation (ONLY for live stream events)
    if (state.liveEventListener) {
      state.liveEventListener(event);
    }

    return true;
  },

  selectNode: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  selectDecision: (id: string | null) => {
    set({ selectedDecisionId: id });
  },

  hoverNode: (id: string | null) => {
    set({ hoveredNodeId: id });
  },

  setWebglLost: (lost: boolean) => {
    set({ webglLost: lost });
  },

  setCameraPreset: (preset: "overview" | "follow_agent" | "top_down") => {
    set({ cameraPreset: preset });
  },

  resolveEscalation: (agentId: string) => {
    const updatedPending = new Map(get().pendingEscalations);
    const count = updatedPending.get(agentId) || 0;
    const newCount = count <= 1 ? 0 : count - 1;
    if (newCount === 0) {
      updatedPending.delete(agentId);
    } else {
      updatedPending.set(agentId, newCount);
    }

    const updatedAgents = new Map(get().agents);
    const agent = updatedAgents.get(agentId);
    if (agent) {
      updatedAgents.set(agentId, {
        ...agent,
        pendingEscalations: newCount,
        escalationTintActive: newCount > 0,
        // Legitimate risk data (agent.riskScore) is preserved without destruction
      });
    }

    set({
      pendingEscalations: updatedPending,
      agents: updatedAgents,
    });
  },

  clearEscalations: () => {
    const state = get();
    const updatedAgents = new Map(state.agents);
    for (const [id, a] of updatedAgents.entries()) {
      updatedAgents.set(id, {
        ...a,
        pendingEscalations: 0,
        escalationTintActive: false,
        lastOutcomeTime: undefined,
        // Legitimate risk data (a.riskScore) is preserved; only visual tint is cleared
      });
    }
    set({
      agents: updatedAgents,
      pendingEscalations: new Map(),
    });
  },

  setLiveEventListener: (fn: ((event: DecisionEvent) => void) | null) => {
    set({ liveEventListener: fn });
  },

  clear: () => {
    set({
      agents: new Map(),
      tools: new Map(),
      grants: [],
      decisions: [],
      latestAuditSeq: 0,
      selectedNodeId: null,
      selectedDecisionId: null,
      hoveredNodeId: null,
      webglLost: false,
      pendingEscalations: new Map(),
      liveEventListener: null,
    });
  },
}));

export interface AgentVisualTint {
  isTinted: boolean;
  tintType: "none" | "escalate" | "deny" | "risk";
  colorHex: string;
  intensity: number;
}

/**
 * Derives the visual alert tint for an agent from recent outcomes with time decay.
 * Prevents permanent amber/violet lock without destroying legitimate underlying risk scores.
 * Escalation tint clears immediately when resolved or cleared via clearEscalations().
 */
export function deriveAgentVisualTint(
  agent: AgentNode,
  now: number = Date.now(),
): AgentVisualTint {
  // 1. If agent has unresolved active escalations, show violet escalation tint
  if (
    agent.pendingEscalations &&
    agent.pendingEscalations > 0 &&
    agent.escalationTintActive !== false
  ) {
    return {
      isTinted: true,
      tintType: "escalate",
      colorHex: "#A78BFA",
      intensity: 1.0,
    };
  }

  // 2. Exponential time decay for recent outcomes (decay half-life of 6s, cut-off at 20s)
  if (agent.lastOutcomeTime && agent.lastOutcome) {
    const elapsedMs = Math.max(0, now - agent.lastOutcomeTime);
    const DECAY_WINDOW_MS = 20_000;
    if (elapsedMs < DECAY_WINDOW_MS) {
      const factor = Math.exp(-elapsedMs / 6_000);
      if (factor > 0.05) {
        if (agent.lastOutcome === "deny") {
          return {
            isTinted: true,
            tintType: "deny",
            colorHex: "#F43F5E",
            intensity: factor,
          };
        }
        if (agent.lastOutcome === "escalate" && agent.escalationTintActive !== false) {
          return {
            isTinted: true,
            tintType: "escalate",
            colorHex: "#A78BFA",
            intensity: factor,
          };
        }
      }
    }
  }

  // 3. Persistent high risk without unhandled escalation (amber tint)
  // Only applies if escalationTintActive is not explicitly suppressed
  if (
    agent.riskScore &&
    agent.riskScore >= 0.9 &&
    agent.escalationTintActive !== false
  ) {
    return {
      isTinted: true,
      tintType: "risk",
      colorHex: "#F59E0B",
      intensity: 0.5,
    };
  }

  return {
    isTinted: false,
    tintType: "none",
    colorHex: "#60A5FA",
    intensity: 0,
  };
}

