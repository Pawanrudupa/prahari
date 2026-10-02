import { Link } from "react-router-dom";
import { ArrowRight, Play, ShieldCheck, Lock, Activity, Cpu } from "lucide-react";
import { Button } from "../../../components/ui";
import { AmbientConstellationBackground } from "./AmbientConstellationBackground";

export function HeroSection() {
  return (
    <section className="relative min-h-[88vh] flex items-center justify-center pt-16 pb-20 overflow-hidden border-b border-white/[0.06]">
      <AmbientConstellationBackground />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Pre-launch Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 mb-8 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono font-medium text-cyan-300">
            Open-Source Architecture • Pre-Alpha Preview
          </span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-100 font-display max-w-4xl leading-[1.1]">
          A sentinel for <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300">AI agents</span>.
        </h1>

        {/* Subhead Value Prop */}
        <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 max-w-2xl font-sans leading-relaxed">
          Deterministic, fail-closed governance proxy that intercepts and validates agent tool calls before execution. Protecting enterprise systems from prompt injection, data exfiltration, and runaway loops.
        </p>

        {/* Action CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link to="/login" className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto shadow-lg"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Launch console
            </Button>
          </Link>

          <a href="#pipeline" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              leftIcon={<Play className="w-4 h-4 text-cyan-400 fill-cyan-400/20" />}
            >
              Watch how it works
            </Button>
          </a>
        </div>

        {/* Architectural Invariants Row */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl w-full text-left">
          <div className="p-3.5 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2 text-cyan-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-semibold font-display text-slate-200">Fail Closed</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Any engine error yields explicit deny</p>
          </div>

          <div className="p-3.5 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-semibold font-display text-slate-200">No Raw Secrets</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Zero raw PII or keys stored in audit logs</p>
          </div>

          <div className="p-3.5 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-semibold font-display text-slate-200">Hash-Chained</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">SHA-256 HMAC signed append-only chain</p>
          </div>

          <div className="p-3.5 rounded-xl border border-white/[0.08] bg-slate-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sky-400 mb-1">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-semibold font-display text-slate-200">Capability Grants</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Strict no-grants = no-tools invariant</p>
          </div>
        </div>
      </div>
    </section>
  );
}
