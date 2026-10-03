import { useState } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  EyeOff,
  Clock,
  ShieldX,
  Bot,
  Wrench,
  Shield,
} from "lucide-react";

export function ConstellationLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/85 backdrop-blur-xl shadow-2xl text-xs font-mono select-none overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/[0.04] transition cursor-pointer text-slate-300"
      >
        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>Legend</span>
        </span>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="p-3 pt-1 border-t border-white/[0.06] space-y-3">
          {/* Nodes */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Graph Nodes
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                <span className="text-slate-200 flex items-center gap-1">
                  <Bot className="w-3 h-3 text-blue-400" /> Agent Node
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rotate-45 bg-slate-400 inline-block" />
                <span className="text-slate-200 flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-slate-400" /> Tool Node
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-cyan-400 inline-block" />
                <span className="text-slate-200 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-cyan-400" /> Policy Shield (R1–R4)
                </span>
              </div>
            </div>
          </div>

          {/* Outcome Effects */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Decisions & Effects
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium">ALLOW:</span>
                <span className="text-slate-400">Emerald pass-through</span>
              </div>
              <div className="flex items-center gap-2">
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300 font-medium">REDACT:</span>
                <span className="text-slate-400">Amber diamond pulse</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-purple-300 font-medium">ESCALATE:</span>
                <span className="text-slate-400">Violet hold + halo</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldX className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300 font-medium">DENY:</span>
                <span className="text-slate-400">Crimson shard burst</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
