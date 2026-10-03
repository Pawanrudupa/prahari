import { describe, it, expect, beforeEach } from "vitest";
import { useGraphStore } from "../stores/useGraphStore";
import type { DecisionEvent, GraphSnapshot } from "../types/graph";

function makeDecision(seq: number, id = `dec-${seq}`, agentId = "ag-1"): DecisionEvent {
  return {
    decision_id: id,
    action_id: `act-${seq}`,
    agent_id: agentId,
    agent_name: "Support-Bot",
    tool_id: "crm.read_ticket",
    outcome: "allow",
    rule_id: "R1-allow-read-tickets",
    risk_score: 0.1,
    session_id: "sess-1",
    parent_action_id: null,
    audit_seq: seq,
    data_classes: [],
    latency_ms: 10.5,
  };
}

describe("useGraphStore", () => {
  beforeEach(() => {
    useGraphStore.getState().clear();
  });

  it("hydrates agents, tools, grants, decisions, and latestAuditSeq from snapshot", () => {
    const snapshot: GraphSnapshot = {
      latest_audit_seq: 42,
      agents: [
        { id: "ag-1", name: "Support-Bot", role: "support", owner: "Ops", status: "active" },
      ],
      tools: [
        { id: "tl-1", name: "crm.read_ticket", server: "crm-mcp", sensitivity: "normal" },
      ],
      grants: [{ agent_id: "ag-1", tool_id: "tl-1" }],
      recent_decisions: [makeDecision(40), makeDecision(41), makeDecision(42)],
    };

    useGraphStore.getState().applySnapshot(snapshot);

    const state = useGraphStore.getState();
    expect(state.agents.size).toBe(1);
    expect(state.agents.get("ag-1")?.name).toBe("Support-Bot");
    expect(state.tools.size).toBe(1);
    expect(state.grants.length).toBe(1);
    expect(state.latestAuditSeq).toBe(42);
    expect(state.decisions.length).toBe(3);
  });

  it("drops events with audit_seq <= latestAuditSeq (strict ordering)", () => {
    useGraphStore.setState({ latestAuditSeq: 50 });

    const staleEvent = makeDecision(49, "dec-49");
    const sameSeqEvent = makeDecision(50, "dec-50");

    const appliedStale = useGraphStore.getState().applyEvent(staleEvent);
    const appliedSame = useGraphStore.getState().applyEvent(sameSeqEvent);

    expect(appliedStale).toBe(false);
    expect(appliedSame).toBe(false);
    expect(useGraphStore.getState().decisions.length).toBe(0);
    expect(useGraphStore.getState().latestAuditSeq).toBe(50);
  });

  it("applies newer events, advances latestAuditSeq, and updates agent stats", () => {
    useGraphStore.getState().applySnapshot({
      latest_audit_seq: 10,
      agents: [{ id: "ag-1", name: "Support-Bot", role: "support", owner: "Ops", status: "active" }],
      tools: [],
      grants: [],
      recent_decisions: [],
    });

    const newEvent = makeDecision(15, "dec-15", "ag-1");
    newEvent.risk_score = 0.85;

    const applied = useGraphStore.getState().applyEvent(newEvent);

    expect(applied).toBe(true);
    const state = useGraphStore.getState();
    expect(state.latestAuditSeq).toBe(15);
    expect(state.decisions.length).toBe(1);
    expect(state.agents.get("ag-1")?.activityCount).toBe(1);
    expect(state.agents.get("ag-1")?.riskScore).toBe(0.85);
  });

  it("deduplicates events by decision_id", () => {
    useGraphStore.setState({ latestAuditSeq: 10 });

    const ev1 = makeDecision(12, "duplicate-id");
    const ev2 = makeDecision(15, "duplicate-id");

    expect(useGraphStore.getState().applyEvent(ev1)).toBe(true);
    expect(useGraphStore.getState().applyEvent(ev2)).toBe(false);
    expect(useGraphStore.getState().decisions.length).toBe(1);
  });

  it("caps decision ring buffer at 1000 items and evicts oldest", () => {
    useGraphStore.setState({ latestAuditSeq: 0 });

    // Insert 1005 decisions
    for (let i = 1; i <= 1005; i++) {
      useGraphStore.getState().applyEvent(makeDecision(i, `id-${i}`));
    }

    const state = useGraphStore.getState();
    expect(state.decisions.length).toBe(1000);
    // Oldest 5 items (seq 1 to 5) should have been evicted
    expect(state.decisions[0]!.audit_seq).toBe(6);
    expect(state.decisions[999]!.audit_seq).toBe(1005);
    expect(state.latestAuditSeq).toBe(1005);
  });

  it("sets and persists pending approval badge count on agent on escalate event until resolved", () => {
    useGraphStore.getState().applySnapshot({
      latest_audit_seq: 10,
      agents: [{ id: "ag-1", name: "Support-Bot", role: "support", owner: "Ops", status: "active" }],
      tools: [],
      grants: [],
      recent_decisions: [],
    });

    const escalateEvent = makeDecision(12, "dec-esc-1", "ag-1");
    escalateEvent.outcome = "escalate";

    useGraphStore.getState().applyEvent(escalateEvent);

    const agentAfterEscalate = useGraphStore.getState().agents.get("ag-1");
    expect(agentAfterEscalate?.pendingEscalations).toBe(1);
    expect(useGraphStore.getState().pendingEscalations.get("ag-1")).toBe(1);

    // Another event for same agent doesn't clear the pending escalation
    const allowEvent = makeDecision(15, "dec-allow-2", "ag-1");
    allowEvent.outcome = "allow";
    useGraphStore.getState().applyEvent(allowEvent);

    expect(useGraphStore.getState().agents.get("ag-1")?.pendingEscalations).toBe(1);

    // Resolving escalation decrements and clears the badge
    useGraphStore.getState().resolveEscalation("ag-1");
    expect(useGraphStore.getState().agents.get("ag-1")?.pendingEscalations).toBe(0);
    expect(useGraphStore.getState().pendingEscalations.get("ag-1")).toBeUndefined();
  });

  it("animates only live stream events and does not invoke live animation listener on snapshot hydration", () => {
    let liveEventCount = 0;
    useGraphStore.getState().setLiveEventListener(() => {
      liveEventCount++;
    });

    // Hydrate snapshot with recent decisions
    useGraphStore.getState().applySnapshot({
      latest_audit_seq: 10,
      agents: [],
      tools: [],
      grants: [],
      recent_decisions: [makeDecision(8), makeDecision(9), makeDecision(10)],
    });

    // Recent decisions from snapshot MUST NOT trigger animation!
    expect(liveEventCount).toBe(0);

    // Live stream event triggers animation listener
    useGraphStore.getState().applyEvent(makeDecision(11));
    expect(liveEventCount).toBe(1);
  });

  it("tracks hovered node and WebGL context loss states", () => {
    expect(useGraphStore.getState().hoveredNodeId).toBeNull();
    useGraphStore.getState().hoverNode("node-xyz");
    expect(useGraphStore.getState().hoveredNodeId).toBe("node-xyz");

    expect(useGraphStore.getState().webglLost).toBe(false);
    useGraphStore.getState().setWebglLost(true);
    expect(useGraphStore.getState().webglLost).toBe(true);
  });

  it("resets agent riskScore and pendingEscalations when clearEscalations is called", () => {
    useGraphStore.getState().applySnapshot({
      latest_audit_seq: 10,
      agents: [{ id: "ag-1", name: "Support-Bot", role: "support", owner: "Ops", status: "active" }],
      tools: [],
      grants: [],
      recent_decisions: [],
    });

    const escalateEvent: DecisionEvent = {
      ...makeDecision(11, "dec-11", "ag-1"),
      outcome: "escalate",
      risk_score: 0.85,
    };
    useGraphStore.getState().applyEvent(escalateEvent);

    const agentWithRisk = useGraphStore.getState().agents.get("ag-1");
    expect(agentWithRisk?.pendingEscalations).toBe(1);
    expect(agentWithRisk?.riskScore).toBe(0.85);

    // Call clearEscalations (Reset Badges)
    useGraphStore.getState().clearEscalations();

    const resetAgent = useGraphStore.getState().agents.get("ag-1");
    expect(resetAgent?.pendingEscalations).toBe(0);
    expect(resetAgent?.riskScore).toBe(0.0);
    expect(useGraphStore.getState().pendingEscalations.size).toBe(0);
  });
});
