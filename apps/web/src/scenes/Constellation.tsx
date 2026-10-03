import { useState, useEffect } from "react";
import { Camera, Bot, Layers } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useGraphStore } from "../stores/useGraphStore";
import { ConstellationCanvas } from "../components/3d/ConstellationCanvas";
import { KpiStrip } from "../components/hud/KpiStrip";
import { LiveEventFeed } from "../components/hud/LiveEventFeed";
import { ConstellationLegend } from "../components/hud/ConstellationLegend";
import { QualitySelector } from "../components/hud/QualitySelector";
import { SimulatorController } from "../components/hud/SimulatorController";
import { CommandPalette } from "../components/hud/CommandPalette";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl") ||
        canvas.getContext("webgl2"))
    );
  } catch {
    return false;
  }
}

export function Constellation() {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const webglLost = useGraphStore((s) => s.webglLost);
  const cameraPreset = useGraphStore((s) => s.cameraPreset);
  const setCameraPreset = useGraphStore((s) => s.setCameraPreset);

  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const [isDegraded, setIsDegraded] = useState<boolean>(false);

  useEffect(() => {
    setWebglSupported(hasWebGL());
  }, []);

  if (!webglSupported || webglLost) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#070A12] text-slate-300">
        <div className="text-center p-8 max-w-md rounded-xl border border-slate-800 bg-slate-900/60 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-xl font-semibold text-white">
            {webglLost ? "WebGL Context Lost" : "3D Acceleration Unavailable"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {webglLost
              ? "The graphics context was lost. Switch to 2D view or reload the page."
              : "WebGL is disabled or unsupported in this environment. The 2D accessible fallback view is active."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070A12]">
      {/* 3D Constellation Canvas */}
      <ConstellationCanvas
        isDegraded={isDegraded}
        reducedMotion={reducedMotion}
      />

      {/* Top HUD Row */}
      <div className="absolute top-3 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* KPI Strip */}
        <div className="pointer-events-auto">
          <KpiStrip />
        </div>

        {/* Controls: Camera Presets, Quality, Command Palette */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Camera Preset Buttons */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/80 p-1 backdrop-blur-md shadow-md text-xs font-mono text-slate-300">
            <button
              onClick={() => setCameraPreset("overview")}
              className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
                cameraPreset === "overview"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Overview angle (35-deg tilt)"
            >
              <Camera className="w-3 h-3 text-cyan-400" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setCameraPreset("follow_agent")}
              className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
                cameraPreset === "follow_agent"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Focus selected agent node"
            >
              <Bot className="w-3 h-3 text-blue-400" />
              <span>Follow</span>
            </button>

            <button
              onClick={() => setCameraPreset("top_down")}
              className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
                cameraPreset === "top_down"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Top-down orbital perspective"
            >
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Top-Down</span>
            </button>
          </div>

          <QualitySelector
            isDegraded={isDegraded}
            onToggleDegraded={setIsDegraded}
          />

          <CommandPalette />
        </div>
      </div>

      {/* Right Column: Live Event Feed & Legend */}
      <div className="absolute top-16 right-4 z-20 flex flex-col gap-3 pointer-events-none">
        <div className="pointer-events-auto">
          <LiveEventFeed />
        </div>
        <div className="pointer-events-auto w-80">
          <ConstellationLegend />
        </div>
      </div>

      {/* Bottom Bar: Simulator Controller */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
        <SimulatorController />
      </div>

      {reducedMotion && (
        <div className="absolute bottom-4 right-4 z-20 rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1 text-xs font-mono text-slate-400 backdrop-blur-md">
          Reduced motion active
        </div>
      )}
    </div>
  );
}
