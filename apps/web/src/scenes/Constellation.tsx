import { useState, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useGraphStore } from "../stores/useGraphStore";
import { ConstellationCanvas } from "../components/3d/ConstellationCanvas";

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
  const agents = useGraphStore((s) => s.agents);
  const tools = useGraphStore((s) => s.tools);

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
      <ConstellationCanvas
        isDegraded={isDegraded}
        reducedMotion={reducedMotion}
      />

      {/* Lightweight HUD / Status Bar */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 pointer-events-none">
        <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 px-3 py-1.5 backdrop-blur-md shadow-md text-xs font-mono text-slate-300 pointer-events-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Agents: {agents.size}
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Tools: {tools.size}
          </span>
        </div>

        {/* Degraded mode toggle */}
        <button
          onClick={() => setIsDegraded((d) => !d)}
          className={`pointer-events-auto rounded-lg px-2.5 py-1 text-xs font-mono border transition-colors ${
            isDegraded
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
              : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Toggle low-power/degraded rendering mode"
        >
          {isDegraded ? "Low-Power Mode (100 particles)" : "High Quality"}
        </button>
      </div>

      {reducedMotion && (
        <div className="absolute bottom-4 left-4 z-10 rounded bg-white/10 px-2 py-1 text-xs font-mono text-slate-400 backdrop-blur-sm">
          Reduced motion active
        </div>
      )}
    </div>
  );
}
