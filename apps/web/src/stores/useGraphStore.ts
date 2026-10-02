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

  applySnapshot: (snapshot: GraphSnapshot) => void;
  applyEvent: (event: DecisionEvent) => boolean;
  selectNode: (id: string | null) => void;
  selectDecision: (id: string | null) => void;
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

  applySnapshot: (snapshot: GraphSnapshot) => {
    const agentsMap = new Map<string, AgentNode>();
    for (const a of snapshot.agents) {
      agentsMap.set(a.id, {
        ...a,
        activityCount: 0,
        riskScore: 0.0,
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

        // Update agent activity count
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

    // 3. Update agent stats in-place
    const updatedAgents = new Map(state.agents);
    const agent = updatedAgents.get(event.agent_id);
    if (agent) {
      updatedAgents.set(event.agent_id, {
        ...agent,
        activityCount: (agent.activityCount || 0) + 1,
        riskScore: Math.max(agent.riskScore || 0, event.risk_score),
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
    });

    return true;
  },

  selectNode: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  selectDecision: (id: string | null) => {
    set({ selectedDecisionId: id });
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
    });
  },
}));
