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

  applySnapshot: (snapshot: GraphSnapshot) => void;
  applyEvent: (event: DecisionEvent) => boolean;
  selectNode: (id: string | null) => void;
  selectDecision: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  setWebglLost: (lost: boolean) => void;
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

    // Merge recent decisions, deduplicating by decision_id
    const existingIds = new Set(get().decisions.map((d) => d.decision_id));
    const mergedDecisions = [...get().decisions];

    for (const d of snapshot.recent_decisions) {
      if (!existingIds.has(d.decision_id)) {
        existingIds.add(d.decision_id);
        mergedDecisions.push(d);

        // Update agent activity count & risk score
        const agent = agentsMap.get(d.agent_id);
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

    if (event.outcome === "escalate") {
      const current = updatedPendingEscalations.get(targetAgentId) || 0;
      updatedPendingEscalations.set(targetAgentId, current + 1);
    }

    if (agent) {
      updatedAgents.set(targetAgentId, {
        ...agent,
        activityCount: (agent.activityCount || 0) + 1,
        riskScore: Math.max(agent.riskScore || 0, event.risk_score),
        pendingEscalations: updatedPendingEscalations.get(targetAgentId) || 0,
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

  resolveEscalation: (agentId: string) => {
    const updatedPending = new Map(get().pendingEscalations);
    const count = updatedPending.get(agentId) || 0;
    if (count <= 1) {
      updatedPending.delete(agentId);
    } else {
      updatedPending.set(agentId, count - 1);
    }

    const updatedAgents = new Map(get().agents);
    const agent = updatedAgents.get(agentId);
    if (agent) {
      updatedAgents.set(agentId, {
        ...agent,
        pendingEscalations: updatedPending.get(agentId) || 0,
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
      updatedAgents.set(id, { ...a, pendingEscalations: 0 });
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
