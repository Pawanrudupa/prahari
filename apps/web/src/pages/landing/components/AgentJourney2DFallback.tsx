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
  Flame,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { PIPELINE_GATES, PipelineGate } from "./AgentJourneyData";
import { Badge, Button, Card, CardContent } from "../../../components/ui";

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

const defaultGate = PIPELINE_GATES[2] ?? PIPELINE_GATES[0]!;

export function AgentJourney2DFallback() {
  const [selectedGate, setSelectedGate] = useState<PipelineGate>(defaultGate);
  const [attackActive, setAttackActive] = useState(false);
  const [activeOutcome, setActiveOutcome] = useState<"idle" | "denied" | "allowed">("idle");

  const handleSendAttack = () => {
    setAttackActive(true);
    setActiveOutcome("idle");
    const injectionGate = PIPELINE_GATES.find((g) => g.id === "injection") ?? defaultGate;
    setSelectedGate(injectionGate);
    setTimeout(() => {
      setActiveOutcome("denied");
      setAttackActive(false);
    }, 1200);
  };

  const handleSendBenign = () => {
    setActiveOutcome("idle");
    setAttackActive(false);
    setTimeout(() => {
      setActiveOutcome("allowed");
    }, 600);
  };

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-slate-950/70 p-6 sm:p-8 backdrop-blur-xl">
      {/* Fallback Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Interactive Pipeline Topology
          </span>
          <h3 className="text-xl font-bold font-display text-slate-100 mt-1">
            8-Gate Agent Governance Journey
          </h3>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            size="sm"
            onClick={handleSendAttack}
            disabled={attackActive}
            leftIcon={<Flame className="w-3.5 h-3.5 text-rose-400" />}
          >
            {attackActive ? "Scanning Attack..." : "Send an attack"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSendBenign}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-300" />}
          >
            Simulate call
          </Button>
        </div>
      </div>

      {/* Outcome notification banner */}
      {activeOutcome === "denied" && (
        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-rose-300 text-xs font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>ATTACK SHATTERED: Prompt injection detected at Gate 03 (Rule R4 / Fail Closed).</span>
          </div>
          <Badge variant="deny" size="sm">DENIED</Badge>
        </div>
      )}

      {activeOutcome === "allowed" && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>CALL PERMITTED: Tool call passed all 8 gates and committed to hash chain.</span>
          </div>
          <Badge variant="allow" size="sm">ALLOWED</Badge>
        </div>
      )}

      {/* 2D Pipeline Horizontal Grid */}
      <div className="mt-8 overflow-x-auto pb-4">
        <div className="min-w-[850px] flex items-center gap-2">
          {PIPELINE_GATES.map((gate, index) => {
            const isSelected = selectedGate.id === gate.id;
            const isAttackTarget = attackActive && gate.id === "injection";

            return (
              <React.Fragment key={gate.id}>
                <button
                  onClick={() => setSelectedGate(gate)}
                  className={`flex-1 p-3.5 rounded-xl border text-left transition-all relative cursor-pointer focus-ring select-none ${
                    isSelected
                      ? "bg-slate-900 border-cyan-400 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                      : "bg-slate-900/40 border-white/[0.08] hover:border-white/20 hover:bg-slate-900/60"
                  } ${isAttackTarget ? "ring-2 ring-rose-500 animate-pulse bg-rose-950/30" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-1 rounded bg-white/[0.05]">{GATE_ICONS[gate.id]}</span>
                    <span className="text-[10px] font-mono text-slate-400">#{gate.step}</span>
                  </div>
                  <div className="text-xs font-bold font-display text-slate-100 truncate">
                    {gate.shortLabel}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
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

      {/* Detail Drawer Card for Selected Gate */}
      <Card variant="elevated" className="mt-6 border-white/10 bg-slate-900/90">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                {GATE_ICONS[selectedGate.id]}
              </div>
              <div>
                <h4 className="text-base font-bold font-display text-slate-100">
                  {selectedGate.name}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Pipeline Step 0{selectedGate.step} • {selectedGate.category.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Implementation:</span>
              <Badge
                variant={
                  selectedGate.status === "Active"
                    ? "allow"
                    : selectedGate.status === "Demo Detector"
                      ? "warning"
                      : "escalate"
                }
                size="sm"
              >
                {selectedGate.status}
              </Badge>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Objective
              </span>
              <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
                {selectedGate.description}
              </p>
            </div>

            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Technical Mechanism
              </span>
              <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
                {selectedGate.technicalMechanism}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Specification: {selectedGate.docReference}</span>
            </span>
            <span className="text-[11px] text-slate-500">Fail-Closed Invariant Guaranteed</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
