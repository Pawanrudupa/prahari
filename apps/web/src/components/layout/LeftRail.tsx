import { Link, useLocation } from "react-router-dom";
import {
  Orbit,
  Bot,
  ScrollText,
  Settings,
  Layers,
  Scale,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Swords,
  FileText,
} from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { useGraphStore } from "../../stores/useGraphStore";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  implemented: boolean;
  roadmapPhase?: string;
}

const ACTIVE_NAV_ITEMS: NavItem[] = [
  { label: "Constellation", icon: Orbit, path: "/app/constellation", implemented: true },
  { label: "Agents & Tools", icon: Bot, path: "/app/agents", implemented: true },
  { label: "Decisions & Audit", icon: ScrollText, path: "/app/decisions", implemented: true },
  { label: "Human Approvals", icon: UserCheck, path: "/app/approvals", implemented: true },
  { label: "Policy Studio", icon: Scale, path: "/app/policies", implemented: true },
  { label: "Session DAG", icon: Layers, path: "/app/sessions", implemented: true },
  { label: "Settings", icon: Settings, path: "/app/settings", implemented: true },
];

const ROADMAP_NAV_ITEMS: NavItem[] = [
  { label: "Incidents", icon: AlertTriangle, path: "/app/incidents", implemented: false, roadmapPhase: "Roadmap" },
  { label: "Replay", icon: RotateCcw, path: "/app/replay", implemented: false, roadmapPhase: "Roadmap" },
  { label: "Red-team", icon: Swords, path: "/app/redteam", implemented: false, roadmapPhase: "Roadmap" },
  { label: "Reports", icon: FileText, path: "/app/reports", implemented: false, roadmapPhase: "Roadmap" },
];

export function LeftRail() {
  const location = useLocation();
  const pendingEscalations = useGraphStore((s) => s.pendingEscalations);

  const totalPending = Array.from(pendingEscalations.values()).reduce((a, b) => a + b, 0);

  return (
    <nav className="flex w-16 flex-col items-center gap-2 border-r border-white/[0.08] bg-slate-950/80 backdrop-blur-xl py-4 z-20 select-none overflow-y-auto">
      {/* Active Working Modules */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {ACTIVE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            (item.path === "/app/constellation" && (location.pathname === "/app" || location.pathname === "/app/"));

          return (
            <Tooltip key={item.path} content={item.label} side="right">
              <Link
                to={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.path === "/app/approvals" && totalPending > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-purple-500 text-[9px] font-bold text-white shadow-lg animate-pulse">
                    {totalPending}
                  </span>
                )}
              </Link>
            </Tooltip>
          );
        })}
      </div>

      {/* Divider with Roadmap indicator */}
      <div className="w-8 flex flex-col items-center my-2 gap-1">
        <div className="w-6 h-[1px] bg-white/[0.1]" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 select-none">
          Plan
        </span>
      </div>

      {/* Roadmap / Unbuilt Modules */}
      <div className="flex flex-col items-center gap-1 w-full opacity-60">
        {ROADMAP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip
              key={item.path}
              content={`${item.label} (${item.roadmapPhase || "Planned"})`}
              side="right"
            >
              <button
                disabled
                aria-label={`${item.label} (Roadmap / Planned)`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-400 cursor-not-allowed transition"
              >
                <Icon className="w-4 h-4" />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
