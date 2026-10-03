import { useState } from "react";
import {
  Play,
  RotateCw,
  Flame,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  Clock,
  Layers,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";

export function SimulatorController() {
  const isDevEnv = useAuthStore((s) => s.isDevEnv);
  const [isRunning, setIsRunning] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  // Show only in dev mode
  if (!import.meta.env.DEV && !isDevEnv) {
    return null;
  }

  const runScenario = async (scenario: string, count: number = 10) => {
    if (isRunning) return;
    setIsRunning(true);
    setLastSummary(null);

    try {
      const resp = await fetch("/v1/dev/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, count, seed: 42 }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const s = data.summary;
        setLastSummary(
          `Ran ${data.count} calls: ${s.allow} Allow, ${s.redact} Redact, ${s.escalate} Escalate, ${s.deny} Deny`,
        );
      } else if (resp.status === 409) {
        setLastSummary("Simulation already in progress");
      } else {
        setLastSummary(`Error: HTTP ${resp.status}`);
      }
    } catch (err: any) {
      setLastSummary(`Failed to trigger simulation: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-white/10 bg-slate-950/85 backdrop-blur-xl shadow-lg text-xs font-mono select-none">
      <span className="text-[11px] text-cyan-400 font-semibold px-2 flex items-center gap-1">
        <Play className="w-3 h-3" />
        <span>SIMULATOR:</span>
      </span>

      <button
        onClick={() => runScenario("benign", 5)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <span>Benign</span>
      </button>

      <button
        onClick={() => runScenario("injection", 5)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <Flame className="w-3 h-3 text-rose-400" />
        <span>Injection</span>
      </button>

      <button
        onClick={() => runScenario("pii", 5)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <EyeOff className="w-3 h-3 text-amber-400" />
        <span>PII</span>
      </button>

      <button
        onClick={() => runScenario("loop", 8)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <RefreshCw className="w-3 h-3 text-purple-400" />
        <span>Loop</span>
      </button>

      <button
        onClick={() => runScenario("privilege", 5)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <ShieldAlert className="w-3 h-3 text-rose-400" />
        <span>Privilege</span>
      </button>

      <button
        onClick={() => runScenario("bulk_export", 5)}
        disabled={isRunning}
        className="px-2 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <Clock className="w-3 h-3 text-purple-400" />
        <span>Bulk Export</span>
      </button>

      <button
        onClick={() => runScenario("all", 20)}
        disabled={isRunning}
        className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 font-semibold transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
      >
        <Layers className="w-3 h-3 text-cyan-400" />
        <span>Run All</span>
      </button>

      {isRunning && (
        <span className="flex items-center gap-1 text-cyan-400 text-[11px] animate-pulse px-2">
          <RotateCw className="w-3 h-3 animate-spin" />
          <span>Dispatching...</span>
        </span>
      )}

      {lastSummary && !isRunning && (
        <span className="text-[10px] text-slate-400 max-w-xs truncate px-1">
          {lastSummary}
        </span>
      )}
    </div>
  );
}
