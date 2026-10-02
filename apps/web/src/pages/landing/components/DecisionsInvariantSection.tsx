import {
  ShieldX,
  Clock,
  EyeOff,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Scale,
} from "lucide-react";
import { Badge } from "../../../components/ui";

export function DecisionsInvariantSection() {
  const precedenceLevels = [
    {
      level: 1,
      outcome: "DENY",
      badgeVariant: "deny" as const,
      colorClass: "border-rose-500/40 bg-rose-500/10 text-rose-400",
      icon: <ShieldX className="w-5 h-5 text-rose-400" />,
      condition: "Any explicit deny rule matches, loop brake trips, or budget is exceeded",
      result: "Tool call rejected immediately; packet shatters; error recorded in audit log.",
    },
    {
      level: 2,
      outcome: "ESCALATE",
      badgeVariant: "escalate" as const,
      colorClass: "border-purple-500/40 bg-purple-500/10 text-purple-400",
      icon: <Clock className="w-5 h-5 text-purple-400" />,
      condition: "Sensitive threshold exceeded (e.g. bulk export > 100 rows, wire transfer)",
      result: "Held at Human Approval Pod awaiting manual authorize/reject decision.",
    },
    {
      level: 3,
      outcome: "REDACT",
      badgeVariant: "redact" as const,
      colorClass: "border-amber-500/40 bg-amber-500/10 text-amber-400",
      icon: <EyeOff className="w-5 h-5 text-amber-400" />,
      condition: "PII or sensitive entity tags detected in argument payload",
      result: "Payload sanitized and masked before being passed downstream.",
    },
    {
      level: 4,
      outcome: "ALLOW",
      badgeVariant: "allow" as const,
      colorClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      condition: "Explicit allow rule matches agent role & granted tool capability",
      result: "Action executed transparently; serial record appended to audit chain.",
    },
    {
      level: 5,
      outcome: "DEFAULT DENY",
      badgeVariant: "deny" as const,
      colorClass: "border-slate-700 bg-slate-900/60 text-slate-400",
      icon: <AlertOctagon className="w-5 h-5 text-slate-400" />,
      condition: "No explicit rule matched or tool is ungranted (fail closed)",
      result: "Rejected with reason default_deny; never permitted implicitly.",
    },
  ];

  return (
    <section id="decision-rules" className="py-24 border-b border-white/[0.06] bg-slate-950/40 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 mb-4 text-xs font-mono font-medium text-emerald-400">
            <Scale className="w-3.5 h-3.5" />
            <span>Non-Negotiable Invariant 1</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold font-display text-slate-100 tracking-tight">
            How decisions are made: Determinism over heuristics.
          </h2>

          <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
            In Prahari, decisions come <strong>only from the deterministic policy engine</strong> and hard limits. LLM, RAG, and ML signals may only explain or make a decision <em>stricter</em> — they can never permit what policy forbids.
          </p>
        </div>

        {/* Precedence Hierarchy Chain */}
        <div className="mt-12 space-y-3 max-w-4xl">
          {precedenceLevels.map((p) => (
            <div
              key={p.outcome}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${p.colorClass} backdrop-blur-md`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-black/30 border border-white/10 shrink-0">
                  {p.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold">PRIORITY 0{p.level}</span>
                    <Badge variant={p.badgeVariant} size="sm">
                      {p.outcome}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 font-mono">
                    Condition: {p.condition}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-400 font-mono text-left sm:text-right shrink-0 max-w-xs">
                {p.result}
              </div>
            </div>
          ))}
        </div>

        {/* Mathematical Proof Statement */}
        <div className="mt-10 p-5 rounded-xl border border-white/[0.08] bg-slate-900/50 backdrop-blur-md max-w-4xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-300 font-mono">
            <span className="text-slate-100 font-semibold block mb-0.5">
              Formal Precedence Theorem:
            </span>
            Decision = <span className="text-rose-400">DENY</span> &gt;{" "}
            <span className="text-purple-400">ESCALATE</span> &gt;{" "}
            <span className="text-amber-400">REDACT</span> &gt;{" "}
            <span className="text-emerald-400">ALLOW</span> &gt;{" "}
            <span className="text-slate-400">DEFAULT DENY</span>.
            <br />
            Any engine or parser error unconditionally yields <span className="text-rose-400 font-bold">DENY</span> with reason <code className="text-rose-300">engine_error</code> (Fail Closed).
          </div>
        </div>
      </div>
    </section>
  );
}
