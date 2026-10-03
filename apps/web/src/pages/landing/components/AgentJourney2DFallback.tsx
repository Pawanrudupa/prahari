import React, { useState } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  Lock,
  FileCheck,
  EyeOff,
  Scale,
  Gauge,
  Activity,
  Database,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { PIPELINE_GATES, PipelineGate, OUTCOME_BRANCHES } from "./AgentJourneyData";
import { Badge, Button } from "../../../components/ui";

const GATE_ICONS: Record<string, React.ReactNode> = {
  identity: <Lock className="w-4 h-4 text-sky-400" />,
  schema: <FileCheck className="w-4 h-4 text-cyan-400" />,
  injection: <ShieldAlert className="w-4 h-4 text-rose-400" />,
  pii: <EyeOff className="w-4 h-4 text-amber-400" />,
  policy: <Scale className="w-4 h-4 text-emerald-400" />,
  limits: <Gauge className="w-4 h-4 text-purple-400" />,
  risk: <Activity className="w-4 h-4 text-indigo-400" />,
  audit: <Database className="w-4 h-4 text-cyan-400" />,
};

interface AgentJourney2DFallbackProps {
  selectedGate?: PipelineGate;
  onSelectGate?: (gate: PipelineGate) => void;
  onRunSimulation?: (mode: "benign" | "pii" | "bulk_export" | "attack") => void;
  activeOutcome?: "allow" | "redact" | "escalate" | "deny" | null;
  outcomeMessage?: string | null;
}

export function AgentJourney2DFallback({
  selectedGate: externalSelectedGate,
  onSelectGate: externalOnSelectGate,
  onRunSimulation,
  activeOutcome: externalActiveOutcome,
  outcomeMessage: externalOutcomeMessage,
}: AgentJourney2DFallbackProps) {
  const [internalSelectedGate, setInternalSelectedGate] = useState<PipelineGate>(
    PIPELINE_GATES[0]!,
  );
  const [internalOutcome, setInternalOutcome] = useState<
    "allow" | "redact" | "escalate" | "deny" | null
  >(null);
  const [internalMessage, setInternalMessage] = useState<string | null>(null);

  const selectedGate = externalSelectedGate ?? internalSelectedGate;
  const setSelectedGate = externalOnSelectGate ?? setInternalSelectedGate;
  const activeOutcome = externalActiveOutcome ?? internalOutcome;
  const outcomeMessage = externalOutcomeMessage ?? internalMessage;

  const handleRunSim = (mode: "benign" | "pii" | "bulk_export" | "attack") => {
    if (onRunSimulation) {
      onRunSimulation(mode);
      return;
    }

    if (mode === "benign") {
      setInternalOutcome("allow");
      setInternalMessage("Allowed: Verified capability grant, executed at Tool Pod (Rule R1).");
      setSelectedGate(PIPELINE_GATES[7]!);
    } else if (mode === "pii") {
      setInternalOutcome("redact");
      setInternalMessage("Redacted: PII entities masked at Gate 04, delivered sanitized (Rule R2).");
      setSelectedGate(PIPELINE_GATES[3]!);
    } else if (mode === "bulk_export") {
      setInternalOutcome("escalate");
      setInternalMessage("Escalated: Bulk export exceeded threshold, held at Human Approval Pod (Rule R3).");
      setSelectedGate(PIPELINE_GATES[4]!);
    } else if (mode === "attack") {
      setInternalOutcome("deny");
      setInternalMessage("Prompt injection shattered at Gate 03 (Rule R4 / Fail Closed).");
      setSelectedGate(PIPELINE_GATES[2]!);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-slate-950/70 p-6 sm:p-8 backdrop-blur-xl">
      {/* 2D Fallback Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            2D Topology View (Accessibility & Low-Power)
          </span>
          <h3 className="text-xl font-bold font-display text-slate-100 mt-1">
            8 Sequential Governance Gates & 4 Outcome Branches
          </h3>
        </div>

        {/* 4 Interactive Simulation Buttons (rendered in standalone mode) */}
        {!onRunSimulation && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRunSim("benign")}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            >
              Send benign
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRunSim("pii")}
              leftIcon={<EyeOff className="w-3.5 h-3.5 text-amber-400" />}
            >
              Send PII
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRunSim("bulk_export")}
              leftIcon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
            >
              Send bulk export
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => handleRunSim("attack")}
              leftIcon={<ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
            >
              Send an attack
            </Button>
          </div>
        )}
      </div>

      {/* Outcome Banner */}
      {outcomeMessage && activeOutcome && (
        <div
          className={`mt-4 p-4 rounded-xl border flex items-center justify-between animate-in fade-in ${
            activeOutcome === "deny"
              ? "bg-rose-950/40 border-rose-500/30 text-rose-300"
              : activeOutcome === "escalate"
                ? "bg-purple-950/40 border-purple-500/30 text-purple-300"
                : activeOutcome === "redact"
                  ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                  : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-mono">
            {activeOutcome === "deny" && <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />}
            {activeOutcome === "escalate" && <Clock className="w-5 h-5 text-purple-400 shrink-0" />}
            {activeOutcome === "redact" && <EyeOff className="w-5 h-5 text-amber-400 shrink-0" />}
            {activeOutcome === "allow" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            <span>{outcomeMessage}</span>
          </div>
          <Badge variant={activeOutcome} size="sm">
            {activeOutcome.toUpperCase()}
          </Badge>
        </div>
      )}

      {/* 2D Gates Grid - 2-line labels on mobile/2D */}
      <div className="mt-8 overflow-x-auto pb-4">
        <div className="min-w-[900px] flex items-center gap-2">
          {PIPELINE_GATES.map((gate, index) => {
            const isSelected = selectedGate.id === gate.id;

            return (
              <React.Fragment key={gate.id}>
                <button
                  type="button"
                  onClick={() => setSelectedGate(gate)}
                  className={`flex-1 p-3.5 rounded-xl border text-left transition-all relative cursor-pointer focus-ring select-none ${
                    isSelected
                      ? "bg-slate-900 border-cyan-400 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                      : "bg-slate-900/40 border-white/[0.08] hover:border-white/20 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-1 rounded bg-white/[0.05]">{GATE_ICONS[gate.id]}</span>
                    <span className="text-[10px] font-mono text-slate-400">0{gate.step}</span>
                  </div>
                  {/* 2-line labels for readability */}
                  <div className="text-xs font-bold font-display text-slate-100 line-clamp-1">
                    {gate.name.split(" ")[0]}
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-1 font-sans">
                    {gate.name.split(" ").slice(1).join(" ") || "Verification"}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <span
                      className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border ${
                        gate.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : gate.status === "Demo Detector"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                      }`}
                    >
                      {gate.status}
                    </span>
                  </div>
                </button>

                {index < PIPELINE_GATES.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 4 Outcome Branches Section */}
      <div className="mt-8 pt-6 border-t border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Post-Pipeline Outcome Branches (After Gate 08)
          </span>
          <span className="text-xs font-mono text-slate-500">Deterministic routing</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {OUTCOME_BRANCHES.map((branch) => {
            const isBranchActive = activeOutcome === branch.id;
            return (
              <div
                key={branch.id}
                className={`p-4 rounded-xl border transition-all ${
                  isBranchActive
                    ? "border-current bg-white/[0.04] shadow-lg"
                    : "border-white/[0.06] bg-slate-900/30"
                }`}
                style={{ color: branch.color }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={branch.id} size="sm">
                    {branch.badgeLabel}
                  </Badge>
                  <span className="text-xs font-mono font-semibold text-slate-300">
                    {branch.id.toUpperCase()}
                  </span>
                </div>
                <h4 className="text-sm font-semibold font-display text-slate-100 mb-1">
                  {branch.name}
                </h4>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  {branch.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
