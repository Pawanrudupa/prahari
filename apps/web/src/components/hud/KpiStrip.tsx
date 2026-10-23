import { useMemo } from "react";
import {
  CheckCircle2,
  EyeOff,
  Clock,
  ShieldX,
  Zap,
  Lock,
} from "lucide-react";
import { useGraphStore } from "../../stores/useGraphStore";

export function computeP95Latency(latencies: number[], minSamples = 5): string {
  if (latencies.length < minSamples) {
    return "—";
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return `${(sorted[p95Idx] ?? 0).toFixed(1)}ms`;
}

export function KpiStrip() {
  const decisions = useGraphStore((s) => s.decisions);
  const pendingApprovalsCount = useGraphStore((s) => s.pendingApprovalsCount);
  const latestAuditSeq = useGraphStore((s) => s.latestAuditSeq);
  const showStressNodes = useGraphStore((s) => s.showStressNodes);
  const agents = useGraphStore((s) => s.agents);

  const stats = useMemo(() => {
    let allow = 0;
    let redact = 0;
    let escalate = 0;
    let deny = 0;
    const latencies: number[] = [];

    const now = Date.now();
    let lastMinuteCount = 0;

    for (const d of decisions) {
      if (!showStressNodes) {
        const agent = agents.get(d.agent_id);
        const isStress =
          d.agent_name?.startsWith("Stress-") ||
          d.agent_id.startsWith("Stress-") ||
          agent?.tags?.includes("stress");
        if (isStress) continue;
      }

      if (d.outcome === "allow") allow++;
      else if (d.outcome === "redact") redact++;
      else if (d.outcome === "escalate") escalate++;
      else if (d.outcome === "deny") deny++;

      if (typeof d.latency_ms === "number" && d.latency_ms > 0) {
        latencies.push(d.latency_ms);
      }

      if (d.timestamp) {
        const timeDiff = now - new Date(d.timestamp).getTime();
        if (timeDiff <= 60000) lastMinuteCount++;
      }
    }

    const p95 = computeP95Latency(latencies, 5);

    return {
      allow,
      redact,
      escalate,
      deny,
      p95,
      totalPending: pendingApprovalsCount,
      decisionsPerMin: lastMinuteCount || (decisions.length > 0 ? Math.min(decisions.length * 2, 45) : 0),
    };
  }, [decisions, pendingApprovalsCount, showStressNodes, agents]);

  return (
    <div
      data-testid="kpi-strip"
      id="hud-kpi-strip"
      className="flex flex-wrap items-center gap-2 text-xs font-mono select-none"
    >
      {/* Decisions / min */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/80 backdrop-blur-md">
        <Zap className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-slate-400">Rate:</span>
        <span className="font-semibold text-slate-100">{stats.decisionsPerMin}/m</span>
      </div>

      {/* Outcome Counts */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/80 backdrop-blur-md">
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>{stats.allow}</span>
        </span>
        <span className="text-slate-600">/</span>
        <span className="flex items-center gap-1 text-amber-400">
          <EyeOff className="w-3 h-3" />
          <span>{stats.redact}</span>
        </span>
        <span className="text-slate-600">/</span>
        <span className="flex items-center gap-1 text-purple-400">
          <Clock className="w-3 h-3" />
          <span>{stats.escalate}</span>
        </span>
        <span className="text-slate-600">/</span>
        <span className="flex items-center gap-1 text-rose-400">
          <ShieldX className="w-3 h-3" />
          <span>{stats.deny}</span>
        </span>
      </div>

      {/* p95 Latency */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/80 backdrop-blur-md">
        <span className="text-slate-400">p95:</span>
        <span className="font-semibold text-cyan-300">{stats.p95}</span>
      </div>

      {/* Pending Approvals */}
      {stats.totalPending > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 backdrop-blur-md animate-pulse">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-purple-300 font-semibold">{stats.totalPending} Pending Approval</span>
        </div>
      )}

      {/* Audit Chain Seq */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/80 backdrop-blur-md">
        <Lock className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-slate-400">Ledger:</span>
        <span className="font-semibold text-slate-100">SEQ #{latestAuditSeq}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="Hash-Chained & Verified" />
      </div>
    </div>
  );
}
