import {
  Orbit,
  Database,
  Lock,
  UserCheck,
  FileCode,
  Sparkles,
  Swords,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Badge } from "../../../components/ui";

export function FeatureGridSection() {
  const capabilities = [
    {
      title: "Live 3D Constellation",
      status: "Active" as const,
      description: "Real-time WebGL visualization of agent nodes, tool connections, and particle outcome physics.",
      icon: <Orbit className="w-5 h-5 text-cyan-400" />,
    },
    {
      title: "Hash-Chained Audit Chain",
      status: "Active" as const,
      description: "SHA-256 HMAC append-only ledger with signed checkpoints preventing post-hoc log tampering.",
      icon: <Database className="w-5 h-5 text-emerald-400" />,
    },
    {
      title: "Capability Grants (No-Grants-No-Tools)",
      status: "Active" as const,
      description: "Strict isolation ensuring an agent cannot invoke any MCP tool without explicit administrative grant.",
      icon: <Lock className="w-5 h-5 text-sky-400" />,
    },
    {
      title: "Human Approvals Queue",
      status: "Active" as const,
      description: "Interactive escalation card deck allowing operators to inspect, approve, or deny held actions.",
      icon: <UserCheck className="w-5 h-5 text-purple-400" />,
    },
    {
      title: "Policy Studio & YAML Engine",
      status: "Active" as const,
      description: "Declarative policy authoring with version history, dry-run testing, and immediate audit tracking.",
      icon: <FileCode className="w-5 h-5 text-indigo-400" />,
    },
    {
      title: "RAG Explanations & Semantic Search",
      status: "Planned" as const,
      description: "Local vector search grounding decisions in relevant organizational policy clauses.",
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
    },
    {
      title: "Adversarial Red-Team Simulator",
      status: "Planned" as const,
      description: "Automated test suites simulating OWASP agentic attack vectors against active policies.",
      icon: <Swords className="w-5 h-5 text-rose-400" />,
    },
    {
      title: "DPDP Act Evidence Pack",
      status: "Planned" as const,
      description: "Structured compliance export of data-class redactions and consent verification trails.",
      icon: <FileText className="w-5 h-5 text-slate-300" />,
    },
  ];

  return (
    <section id="features" className="py-24 border-b border-white/[0.06] bg-slate-950/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 mb-4 text-xs font-mono font-medium text-cyan-300">
            <span>Capability Matrix</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold font-display text-slate-100 tracking-tight">
            Enterprise-grade governance capabilities.
          </h2>

          <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
            Honest breakdown of implemented vs planned roadmap features. No fabricated metrics, no exaggerated marketing claims.
          </p>
        </div>

        {/* Capabilities Grid */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="p-5 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md flex flex-col justify-between hover:border-white/15 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    {cap.icon}
                  </div>
                  <Badge
                    variant={cap.status === "Active" ? "allow" : "escalate"}
                    size="sm"
                  >
                    {cap.status}
                  </Badge>
                </div>

                <h3 className="text-sm font-bold font-display text-slate-100 mb-1.5">
                  {cap.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  {cap.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Legal Disclaimer Callout */}
        <div className="mt-10 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-md flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 font-mono leading-relaxed">
            <strong>Statutory Disclaimer:</strong> DPDP features are technical evidence and entity-tagging tools. Prahari provides technical telemetry and evidence flagging; this software does not constitute legal compliance advice or formal statutory certification.
          </p>
        </div>
      </div>
    </section>
  );
}
