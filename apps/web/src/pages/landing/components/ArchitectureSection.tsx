import { Layers, ShieldCheck, Terminal, Cpu } from "lucide-react";

export function ArchitectureSection() {
  const stackItems = [
    { label: "Backend API", tech: "FastAPI + Python 3.12 (Async / Fail-Closed)" },
    { label: "Relational & Vector", tech: "PostgreSQL 16 + pgvector" },
    { label: "Rate Limiting & Pub/Sub", tech: "Redis 7 (Sliding Window & WS Bus)" },
    { label: "Frontend Web", tech: "React 19 + TypeScript (Strict) + Vite" },
    { label: "3D Visualization", tech: "Three.js + React-Three-Fiber (Pooled Mesh)" },
    { label: "Styling & Tokens", tech: "Tailwind CSS v4 + Radix Primitives" },
  ];

  return (
    <section id="architecture" className="py-24 border-b border-white/[0.06] bg-slate-950/60 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 mb-4 text-xs font-mono font-medium text-sky-300">
            <Layers className="w-3.5 h-3.5" />
            <span>Under The Hood</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold font-display text-slate-100 tracking-tight">
            High-throughput, fail-closed architecture.
          </h2>

          <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
            Prahari operates as an inline reverse-proxy positioned between agent runtimes and MCP tool servers, maintaining sub-30ms p95 evaluation overhead.
          </p>
        </div>

        {/* Pipeline Architecture Box */}
        <div className="mt-12 p-6 sm:p-8 rounded-2xl border border-white/[0.08] bg-slate-900/50 backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4 font-mono text-xs">
            {/* Stage 1 */}
            <div className="flex-1 p-4 rounded-xl border border-sky-500/30 bg-sky-500/5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-sky-400 font-bold block mb-1">STAGE 1</span>
                <div className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  Agent Runtime
                </div>
                <p className="text-[11px] text-slate-400 mt-2 font-sans">
                  LangGraph, CrewAI, AutoGen, or custom agent dispatches tool call.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-sky-500/20 text-[10px] text-slate-500">
                Bearer API Key + Session ID
              </div>
            </div>

            {/* Stage 2 */}
            <div className="flex-1 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex flex-col justify-between shadow-[0_0_20px_rgba(56,189,248,0.1)]">
              <div>
                <span className="text-[10px] text-cyan-400 font-bold block mb-1">STAGE 2 (PROXIED)</span>
                <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Prahari Gateway
                </div>
                <p className="text-[11px] text-slate-300 mt-2 font-sans">
                  8-gate pipeline: Auth &rarr; Schema &rarr; Injection &rarr; PII &rarr; Policy &rarr; Limits &rarr; Risk &rarr; Audit.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-cyan-500/20 text-[10px] text-cyan-300 font-semibold">
                p95 &lt; 25ms Evaluation
              </div>
            </div>

            {/* Stage 3 */}
            <div className="flex-1 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold block mb-1">STAGE 3</span>
                <div className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  MCP Tool Server
                </div>
                <p className="text-[11px] text-slate-400 mt-2 font-sans">
                  Target API, CRM, or infrastructure execute only permitted/sanitized calls.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-emerald-500/20 text-[10px] text-slate-500">
                Sanitized Payload Dispatched
              </div>
            </div>
          </div>

          {/* Tech Stack Pills */}
          <div className="mt-8 pt-6 border-t border-white/[0.08]">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-4">
              Technology Stack
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stackItems.map((item) => (
                <div
                  key={item.label}
                  className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex flex-col text-xs font-mono"
                >
                  <span className="text-slate-400 text-[11px]">{item.label}</span>
                  <span className="text-slate-200 font-medium mt-0.5">{item.tech}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
