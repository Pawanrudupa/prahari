import { ExternalLink, AlertTriangle, Terminal, ShieldAlert, DollarSign, Database } from "lucide-react";

export function ProblemSection() {
  const risks = [
    {
      code: "ASI01",
      title: "Prompt Injection & Tool Hijacking",
      description:
        "Untrusted user instructions or retrieved web context manipulate LLM reasoning, prompting the agent to invoke dangerous functions with attacker-controlled arguments.",
      icon: <Terminal className="w-5 h-5 text-rose-400" />,
    },
    {
      code: "ASI03",
      title: "Over-Privileged Tool Access",
      description:
        "Agents granted broad MCP tool tokens can read customer PII or invoke infrastructure restart commands outside their operational role without explicit permission gates.",
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
    },
    {
      code: "ASI05",
      title: "Runaway Recursive Loops",
      description:
        "Flawed reasoning chains or hallucinated arguments create infinite retry loops, exhausting upstream rate limits, triggering third-party spend, and causing service degradation.",
      icon: <DollarSign className="w-5 h-5 text-purple-400" />,
    },
    {
      code: "ASI08",
      title: "Zero Cryptographic Auditability",
      description:
        "Standard API gateway logs record isolated HTTP requests, losing the causal chain of agent steps, goal sessions, and evidence needed for regulatory compliance.",
      icon: <Database className="w-5 h-5 text-sky-400" />,
    },
  ];

  return (
    <section id="problem" className="py-24 border-b border-white/[0.06] bg-slate-950/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 mb-4 text-xs font-mono font-medium text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>The Agentic Threat Landscape</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold font-display text-slate-100 tracking-tight">
            Traditional API gateways were built for microservices, not autonomous agents.
          </h2>

          <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
            When an AI model is equipped with function calling, it shifts from generating text to orchestrating irreversible system operations: issuing refunds, modifying database rows, and triggering infrastructure tasks.
          </p>

          <div className="mt-5 flex items-center gap-2">
            <span className="text-xs text-slate-400">Grounded in the</span>
            <a
              href="https://genai.owasp.org/llm-top-10/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
            >
              OWASP Top 10 for Agentic Applications
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Threat Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-5">
          {risks.map((risk) => (
            <div
              key={risk.code}
              className="p-6 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md hover:border-white/15 transition-all group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] group-hover:scale-105 transition-transform">
                  {risk.icon}
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white/[0.05] text-slate-400 border border-white/[0.08]">
                  {risk.code}
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-100 font-display mb-2">{risk.title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-sans">{risk.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
