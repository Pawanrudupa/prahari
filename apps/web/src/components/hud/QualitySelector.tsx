import { useState, useEffect, useRef } from "react";
import { Cpu, Gauge } from "lucide-react";
import { isWebGLAvailable } from "../../utils/webgl";

interface QualitySelectorProps {
  isDegraded: boolean;
  onToggleDegraded: (degraded: boolean) => void;
}

export function QualitySelector({ isDegraded, onToggleDegraded }: QualitySelectorProps) {
  const [fps, setFps] = useState<number>(60);
  const [rendererString, setRendererString] = useState<string>("WebGL Accelerated");
  const [qualityMode, setQualityMode] = useState<"auto" | "high" | "low">("auto");

  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(performance.now());

  // Detect WebGL renderer string
  useEffect(() => {
    if (!isWebGLAvailable()) return;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          if (renderer) {
            const clean = renderer
              .replace(/ANGLE \((.*?), (.*?), (.*?)\)/, "$2")
              .replace(/Direct3D.*/, "")
              .trim();
            setRendererString(clean || renderer);
          }
        }
      }
    } catch {
      // Fallback in environments without webgl
    }
  }, []);

  // Live median FPS measurement loop
  useEffect(() => {
    let animId: number;

    const tick = () => {
      // CRITICAL FIX: Ignore background tab throttling when document.hidden
      if (!document.hidden) {
        const now = performance.now();
        const delta = now - lastTimeRef.current;
        lastTimeRef.current = now;

        if (delta > 0 && delta < 500) {
          const currentFps = 1000 / delta;
          frameTimesRef.current.push(currentFps);
          if (frameTimesRef.current.length > 60) {
            frameTimesRef.current.shift();
          }

          // Calculate median every 30 frames
          if (frameTimesRef.current.length >= 20 && frameTimesRef.current.length % 10 === 0) {
            const sorted = [...frameTimesRef.current].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const medianFps = Math.round(sorted[mid] ?? 60);
            setFps(medianFps);

            // Auto-degradation logic (only after gathering sufficient frames)
            if (qualityMode === "auto" && frameTimesRef.current.length >= 50) {
              if (medianFps < 25 && !isDegraded) {
                onToggleDegraded(true);
              }
            }
          }
        }
      } else {
        // Reset last time when coming back from hidden
        lastTimeRef.current = performance.now();
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [qualityMode, isDegraded, onToggleDegraded]);

  const handleModeChange = (mode: "auto" | "high" | "low") => {
    setQualityMode(mode);
    if (mode === "high") {
      onToggleDegraded(false);
    } else if (mode === "low") {
      onToggleDegraded(true);
    } else {
      // Auto
      onToggleDegraded(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1.5 backdrop-blur-md shadow-md text-xs font-mono text-slate-300 select-none">
      {/* GPU / Renderer Display */}
      <span className="flex items-center gap-1.5 text-slate-400 max-w-[160px] truncate" title={rendererString}>
        <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate">{rendererString}</span>
      </span>

      <span className="text-slate-700">|</span>

      {/* Live Median FPS */}
      <span className="flex items-center gap-1">
        <Gauge className="w-3.5 h-3.5 text-emerald-400" />
        <span
          className={`font-semibold ${
            fps >= 50 ? "text-emerald-400" : fps >= 30 ? "text-amber-400" : "text-rose-400"
          }`}
        >
          {fps} FPS
        </span>
      </span>

      <span className="text-slate-700">|</span>

      {/* Quality Mode Toggle */}
      <div className="flex items-center gap-1">
        {(["auto", "high", "low"] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold transition cursor-pointer ${
              qualityMode === m
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
