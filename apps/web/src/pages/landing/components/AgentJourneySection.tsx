import { useState, useEffect, useRef, Suspense, lazy } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  EyeOff,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { PIPELINE_GATES, PipelineGate } from "./AgentJourneyData";
import { SimulationType } from "./AgentJourney3DScene";
import { AgentJourney2DFallback } from "./AgentJourney2DFallback";
import { isWebGLAvailable, prefersReducedMotion } from "../../../utils/webgl";
import { Button, Badge, Card, CardContent } from "../../../components/ui";

// Lazy load Canvas and 3D scene to keep initial landing bundle light
const LazyCanvas = lazy(() =>
  import("@react-three/fiber").then((m) => ({ default: m.Canvas })),
);
const LazyScene = lazy(() =>
  import("./AgentJourney3DScene").then((m) => ({ default: m.AgentJourney3DScene })),
);

const defaultGate = PIPELINE_GATES[0]!;

export function AgentJourneySection() {
  const [selectedGate, setSelectedGate] = useState<PipelineGate>(defaultGate);
  const [simulationMode, setSimulationMode] = useState<SimulationType>("idle");
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [outcomeType, setOutcomeType] = useState<"allow" | "redact" | "escalate" | "deny" | null>(null);
  const [canRender3D, setCanRender3D] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanRender3D(isWebGLAvailable() && !prefersReducedMotion());

    if (!sectionRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleStartSim = (type: SimulationType) => {
    setSimulationMode(type);
    setOutcomeMessage(null);
    setOutcomeType(null);

    if (type === "attack") {
      setSelectedGate(PIPELINE_GATES[2] ?? defaultGate); // Gate 03: Injection scan
    } else if (type === "pii") {
      setSelectedGate(PIPELINE_GATES[3] ?? defaultGate); // Gate 04: PII Masking
    } else if (type === "bulk_export") {
      setSelectedGate(PIPELINE_GATES[4] ?? defaultGate); // Gate 05: Policy
    } else if (type === "benign") {
      setSelectedGate(PIPELINE_GATES[7] ?? defaultGate); // Gate 08: Audit Chain
    }

    // When 3D canvas is disabled (headless/reduced-motion fallback), immediately set outcome
    if (!canRender3D && type !== "idle") {
      const fallbackOutcomes: Record<
        Exclude<SimulationType, "idle">,
        { msg: string; outcome: "allow" | "redact" | "escalate" | "deny" }
      > = {
        attack: {
          msg: "Prompt injection shattered at Gate 03 (Rule R4 / Fail Closed).",
          outcome: "deny",
        },
        pii: {
          msg: "Redacted: PII entities masked at Gate 04, delivered sanitized (Rule R2).",
          outcome: "redact",
        },
        bulk_export: {
          msg: "Escalated: Bulk export exceeded threshold, held at Human Approval Pod (Rule R3).",
          outcome: "escalate",
        },
        benign: {
          msg: "Allowed: Verified capability grant, executed at Tool Pod (Rule R1).",
          outcome: "allow",
        },
      };
      const res = fallbackOutcomes[type];
      setOutcomeType(res.outcome);
      setOutcomeMessage(res.msg);
      setSimulationMode("idle");
    }
  };

  const handleSimulationFinish = (
    message: string,
    outcome: "allow" | "redact" | "escalate" | "deny",
  ) => {
    setOutcomeType(outcome);
    setOutcomeMessage(message);
    setSimulationMode("idle");
  };

  const handleStepPrev = () => {
    const currentIndex = PIPELINE_GATES.findIndex((g) => g.id === selectedGate.id);
    if (currentIndex > 0) {
      const prev = PIPELINE_GATES[currentIndex - 1];
      if (prev) setSelectedGate(prev);
    }
  };

  const handleStepNext = () => {
    const currentIndex = PIPELINE_GATES.findIndex((g) => g.id === selectedGate.id);
    if (currentIndex < PIPELINE_GATES.length - 1) {
      const next = PIPELINE_GATES[currentIndex + 1];
      if (next) setSelectedGate(next);
    }
  };

  const isSimulating = simulationMode !== "idle";

  return (
    <section id="pipeline" ref={sectionRef} className="py-24 scroll-mt-20 border-b border-white/[0.06] bg-slate-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 mb-3 text-xs font-mono font-medium text-cyan-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive 3D Pipeline Topology</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold font-display text-slate-100 tracking-tight">
              The Agent Journey: Intercepting Function Calls
            </h2>
            <p className="mt-3 text-slate-300 text-sm sm:text-base max-w-2xl">
              Every tool call emitted by an agent travels through 8 sequential governance gates. Decisions are deterministic and fail-closed: policy alone decides outcome.
            </p>
          </div>

          {/* 4 Interactive Test Buttons & Gate Stepper */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStartSim("benign")}
              disabled={isSimulating}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            >
              Send benign
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStartSim("pii")}
              disabled={isSimulating}
              leftIcon={<EyeOff className="w-3.5 h-3.5 text-amber-400" />}
            >
              Send PII
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStartSim("bulk_export")}
              disabled={isSimulating}
              leftIcon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
            >
              Send bulk export
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => handleStartSim("attack")}
              disabled={isSimulating}
              leftIcon={<ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
            >
              Send an attack
            </Button>

            <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-lg p-1 ml-auto lg:ml-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStepPrev}
                disabled={selectedGate.step === 1}
                aria-label="Previous Gate"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs font-mono px-2 text-slate-300">
                0{selectedGate.step} / 0{PIPELINE_GATES.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStepNext}
                disabled={selectedGate.step === PIPELINE_GATES.length}
                aria-label="Next Gate"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Dynamic Outcome Notification Alert */}
        {outcomeMessage && outcomeType && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-center justify-between animate-in fade-in ${
              outcomeType === "deny"
                ? "bg-rose-950/40 border-rose-500/30 text-rose-300"
                : outcomeType === "escalate"
                  ? "bg-purple-950/40 border-purple-500/30 text-purple-300"
                  : outcomeType === "redact"
                    ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                    : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-mono">
              {outcomeType === "deny" && <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />}
              {outcomeType === "escalate" && <Clock className="w-5 h-5 text-purple-400 shrink-0" />}
              {outcomeType === "redact" && <EyeOff className="w-5 h-5 text-amber-400 shrink-0" />}
              {outcomeType === "allow" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
              <span>{outcomeMessage}</span>
            </div>
            <Badge variant={outcomeType} size="sm">
              {outcomeType.toUpperCase()}
            </Badge>
          </div>
        )}

        {/* 3D Scene or 2D Fallback */}
        {canRender3D ? (
          <div className="relative w-full h-[70vh] min-h-[550px] rounded-2xl border border-white/[0.08] bg-slate-900/60 overflow-hidden shadow-2xl backdrop-blur-xl">
            {/* Top Guide overlay */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-950/80 border border-white/10 text-slate-400 backdrop-blur-md">
                Click any gate or run an action above • Orbit & Zoom enabled
              </span>
            </div>

            {/* 3D Canvas */}
            {isVisible && (
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-xs font-mono text-slate-500">
                    Loading 3D Pipeline Topology...
                  </div>
                }
              >
                <LazyCanvas
                  camera={{ position: [-14, 1.2, 9.2], fov: 45 }}
                  gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
                  dpr={[1, 1.5]}
                  className="w-full h-full"
                >
                  <LazyScene
                    selectedGate={selectedGate}
                    onSelectGate={setSelectedGate}
                    simulationMode={simulationMode}
                    onSimulationFinish={handleSimulationFinish}
                  />
                </LazyCanvas>
              </Suspense>
            )}
          </div>
        ) : (
          <AgentJourney2DFallback
            selectedGate={selectedGate}
            onSelectGate={setSelectedGate}
            onRunSimulation={handleStartSim}
            activeOutcome={outcomeType}
            outcomeMessage={outcomeMessage}
          />
        )}

        {/* Detail Inspection Card */}
        <Card variant="elevated" className="mt-8 border-white/10 bg-slate-900/90 shadow-xl">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-cyan-400">
                    GATE 0{selectedGate.step}
                  </span>
                  <span className="text-xs font-mono text-slate-400">•</span>
                  <span className="text-xs font-mono text-slate-400 uppercase">
                    {selectedGate.category}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold font-display text-slate-100 mt-1">
                  {selectedGate.name}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    selectedGate.status === "Active"
                      ? "allow"
                      : selectedGate.status === "Demo Detector"
                        ? "warning"
                        : "neutral"
                  }
                  size="md"
                >
                  {selectedGate.status}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
                  Operational Purpose
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {selectedGate.description}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
                  Technical Mechanism
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed font-mono text-xs bg-slate-950/60 p-3 rounded-lg border border-white/5">
                  {selectedGate.technicalMechanism}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                Specification: {selectedGate.docReference}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Gate 0{selectedGate.step} of 0{PIPELINE_GATES.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
