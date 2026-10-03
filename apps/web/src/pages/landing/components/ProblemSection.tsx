import { ExternalLink, AlertTriangle, Terminal, ShieldAlert, Cpu, RefreshCw } from "lucide-react";

// Verified against OWASP Top 10 for Agentic Applications (2026 edition):
// https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
export function ProblemSection() {
  const risks = [
    {
      code: "ASI01",
      title: "Agent Goal Hijack",
      description:
        "Untrusted user instructions or poisoned web context manipulate LLM reasoning, hijacking the agent's core objectives to execute unauthorized actions.",
      icon: <Terminal className="w-5 h-5 text-rose-400" />,
    },
    {
      code: "ASI02",
      title: "Tool Misuse and Exploitation",
      description:
        "Autonomous agents invoke external tools and APIs with attacker-crafted or malformed parameters, causing unintended side effects and data exposure.",
      icon: <Cpu className="w-5 h-5 text-amber-400" />,
    },
    {
      code: "ASI03",
      title: "Identity and Privilege Abuse",
      description:
        "Agents operating with overly broad capabilities access customer data or trigger high-privilege infrastructure tools outside their designated operational role.",
      icon: <ShieldAlert className="w-5 h-5 text-purple-400" />,
    },
    {
      code: "ASI08",
      title: "Cascading Failures",
      description:
        "Unchecked recursive loops and unhandled step failures propagate across interconnected agents, exhausting rate limits and degrading downstream services.",
      icon: <RefreshCw className="w-5 h-5 text-sky-400" />,
    },
  ];

  return (
    <section id="problem" className="py-24 border-b border-white/[0.06] bg-slate-950/60 relative scroll-mt-20">
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
              href="https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
            >
              OWASP Top 10 for Agentic Applications (2026)
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
