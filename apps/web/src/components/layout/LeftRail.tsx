import { Link, useLocation } from "react-router-dom";
import {
  Orbit,
  Layers,
  Scale,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Swords,
  FileText,
  Settings,
} from "lucide-react";
import { Tooltip } from "../ui/Tooltip";

const NAV_ITEMS = [
  { label: "Constellation", icon: Orbit, path: "/app/constellation", implemented: true },
  { label: "Sessions", icon: Layers, path: "/app/sessions", implemented: false },
  { label: "Policies", icon: Scale, path: "/app/policies", implemented: false },
  { label: "Approvals", icon: UserCheck, path: "/app/approvals", implemented: false },
  { label: "Incidents", icon: AlertTriangle, path: "/app/incidents", implemented: false },
  { label: "Replay", icon: RotateCcw, path: "/app/replay", implemented: false },
  { label: "Red-team", icon: Swords, path: "/app/redteam", implemented: false },
  { label: "Reports", icon: FileText, path: "/app/reports", implemented: false },
  { label: "Settings", icon: Settings, path: "/app/settings", implemented: false },
];

export function LeftRail() {
  const location = useLocation();

  return (
    <nav className="flex w-16 flex-col items-center gap-2 border-r border-white/[0.08] bg-slate-950/80 backdrop-blur-xl py-4 z-20 select-none">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          location.pathname === item.path ||
          (item.path === "/app/constellation" && (location.pathname === "/app" || location.pathname === "/app/"));

        if (item.implemented) {
          return (
            <Tooltip key={item.path} content={item.label} side="right">
              <Link
                to={item.path}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-5 h-5" />
              </Link>
            </Tooltip>
          );
        }

        return (
          <div key={item.path} className="flex flex-col items-center">
            {item.path === "/app/sessions" && (
              <div className="w-6 h-[1px] bg-white/[0.08] my-2" />
            )}
            <Tooltip content={`${item.label} (Roadmap / Planned)`} side="right">
              <button
                disabled
                aria-label={item.label}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 opacity-30 cursor-not-allowed"
              >
                <Icon className="w-5 h-5" />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </nav>
  );
}
