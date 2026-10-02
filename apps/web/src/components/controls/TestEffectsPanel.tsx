import { useState } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useGraphStore } from "../../stores/useGraphStore";
import type { DecisionOutcome, DecisionEvent } from "../../types/graph";

export function TestEffectsPanel() {
  const isDevEnv = useAuthStore((s) => s.isDevEnv);
  const clearEscalations = useGraphStore((s) => s.clearEscalations);
  const [isOpen, setIsOpen] = useState(true);

  // Dev-only guard: hide in production
  if (!import.meta.env.DEV && !isDevEnv) {
    return null;
  }

  const triggerEffect = (outcome: DecisionOutcome) => {
    const state = useGraphStore.getState();
    let agentId = Array.from(state.agents.keys())[0];
    let toolId = Array.from(state.tools.keys())[0];

    // Fallback: If database is completely empty, populate minimal nodes so particles have valid endpoints
    if (!agentId || !toolId) {
      state.applySnapshot({
        latest_audit_seq: state.latestAuditSeq,
        agents: [
          {
            id: "dev-agent-1",
            name: "Support-Bot",
            role: "support",
            owner: "Dev Team",
            status: "active",
          },
        ],
        tools: [
          {
            id: "dev-tool-1",
            name: "crm.read_ticket",
            server: "crm-server",
            sensitivity: "normal",
          },
        ],
        grants: [{ agent_id: "dev-agent-1", tool_id: "dev-tool-1" }],
        recent_decisions: [],
      });
      agentId = "dev-agent-1";
      toolId = "dev-tool-1";
    }

    const agent = state.agents.get(agentId);
    const ruleIdMap: Record<DecisionOutcome, string> = {
      allow: "R1-allow-read-tickets",
      redact: "R2-redact-pii-outbound",
      deny: "R4-deny-untrusted-instruction",
      escalate: "R3-escalate-bulk-export",
    };

    const nextSeq = useGraphStore.getState().latestAuditSeq + 1;
    const testEvent: DecisionEvent = {
      decision_id: `test-dec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      action_id: `test-act-${Date.now()}`,
      agent_id: agentId,
      agent_name: agent?.name || "Support-Bot",
      tool_id: toolId,
      outcome,
      rule_id: ruleIdMap[outcome] ?? null,
      risk_score: outcome === "escalate" ? 0.85 : outcome === "deny" ? 0.95 : 0.0,
      session_id: `test-sess-${Date.now()}`,
      parent_action_id: null,
      audit_seq: nextSeq,
      data_classes: outcome === "redact" ? ["aadhaar", "pan"] : [],
      latency_ms: 15.0,
      timestamp: new Date().toISOString(),
    };

    state.applyEvent(testEvent);
  };

  return (
    <div
      data-testid="test-effects-panel"
      className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 font-mono"
    >
      {isOpen ? (
        <div className="w-64 rounded-xl border border-white/15 bg-[#0D1322]/90 p-3 shadow-2xl backdrop-blur-md">
          <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-semibold text-[#2DD4A7] flex items-center gap-1.5">
              <span>⚡</span> TEST 3D EFFECTS
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-white/40 hover:text-white transition"
              title="Minimize panel"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => triggerEffect("allow")}
              data-testid="test-effect-allow"
              className="flex items-center justify-between rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/25 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                Allow
              </span>
              <span className="text-[10px] text-emerald-400/70">Pass-Through</span>
            </button>

            <button
              onClick={() => triggerEffect("redact")}
              data-testid="test-effect-redact"
              className="flex items-center justify-between rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/25 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                Redact
              </span>
              <span className="text-[10px] text-amber-300/70">Amber Pulse</span>
            </button>

            <button
              onClick={() => triggerEffect("deny")}
              data-testid="test-effect-deny"
              className="flex items-center justify-between rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/25 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                Deny
              </span>
              <span className="text-[10px] text-rose-300/70">Shield Burst</span>
            </button>

            <button
              onClick={() => triggerEffect("escalate")}
              data-testid="test-effect-escalate"
              className="flex items-center justify-between rounded-lg bg-purple-500/15 border border-purple-500/30 px-2.5 py-1.5 text-xs text-purple-300 hover:bg-purple-500/25 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                Escalate
              </span>
              <span className="text-[10px] text-purple-300/70">Hold + Halo</span>
            </button>

            <button
              onClick={clearEscalations}
              data-testid="test-clear-escalations"
              className="mt-1 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white/50 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              Reset Badges
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-full border border-emerald-500/40 bg-[#0D1322]/90 px-3 py-1.5 text-xs text-emerald-400 shadow-xl backdrop-blur-md hover:bg-emerald-500/20 transition cursor-pointer flex items-center gap-1.5"
        >
          <span>⚡</span> Test Effects
        </button>
      )}
    </div>
  );
}
