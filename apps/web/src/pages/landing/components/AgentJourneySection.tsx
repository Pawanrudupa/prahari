import { useState, useEffect, useRef, Suspense, lazy } from "react";
import {
  Flame,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { PIPELINE_GATES, PipelineGate } from "./AgentJourneyData";
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
  const [attackActive, setAttackActive] = useState(false);
  const [attackOutcome, setAttackOutcome] = useState<string | null>(null);
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

  const handleSendAttack = () => {
    setAttackActive(true);
    setAttackOutcome(null);
    setSelectedGate(PIPELINE_GATES[2] ?? defaultGate); // Gate 03: Injection scan
  };

  const handleAttackFinish = () => {
    setAttackActive(false);
    setAttackOutcome("Prompt injection shattered at Gate 03 (Rule R4 / Fail-Closed).");
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

  return (
    <section id="pipeline" ref={sectionRef} className="py-24 scroll-mt-20 border-b border-white/[0.06] bg-slate-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
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

          {/* Attack & Navigation Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              size="md"
              onClick={handleSendAttack}
              disabled={attackActive}
              leftIcon={<Flame className="w-4 h-4 text-rose-400" />}
            >
              {attackActive ? "Intercepting Attack..." : "Send an attack"}
            </Button>

            <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-lg p-1">
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

        {/* Attack Outcome Alert */}
        {attackOutcome && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2.5 text-rose-300 text-xs sm:text-sm font-mono">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{attackOutcome}</span>
            </div>
            <Badge variant="deny" size="sm">
              SHATTERED
            </Badge>
          </div>
        )}

        {/* 3D Scene or 2D Fallback */}
        {canRender3D ? (
          <div className="relative w-full h-[460px] rounded-2xl border border-white/[0.08] bg-slate-900/60 overflow-hidden shadow-2xl backdrop-blur-xl">
            {/* Top Guide overlay */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-950/80 border border-white/10 text-slate-400 backdrop-blur-md">
                Click any gate to focus • Orbit & Zoom enabled
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
                  camera={{ position: [selectedGate.positionX, 1.5, 9], fov: 45 }}
                  gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
                  dpr={[1, 1.5]}
                  className="w-full h-full"
                >
                  <LazyScene
                    selectedGate={selectedGate}
                    onSelectGate={setSelectedGate}
                    attackActive={attackActive}
                    onAttackFinish={handleAttackFinish}
                  />
                </LazyCanvas>
              </Suspense>
            )}
          </div>
        ) : (
          <AgentJourney2DFallback />
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
                <span className="text-xs font-mono text-slate-400">Architecture Status:</span>
                <Badge
                  variant={
                    selectedGate.status === "Active"
                      ? "allow"
                      : selectedGate.status === "Demo Detector"
                        ? "warning"
                        : "escalate"
                  }
                  size="md"
                >
                  {selectedGate.status}
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Inspection Objective
                </h4>
                <p className="text-sm text-slate-300 font-sans leading-relaxed">
                  {selectedGate.description}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Technical Mechanism
                </h4>
                <p className="text-sm text-slate-300 font-sans leading-relaxed">
                  {selectedGate.technicalMechanism}
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Reference: {selectedGate.docReference}</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Deterministic Invariant 1 Compliant</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
