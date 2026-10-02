import React from "react";
import { cn } from "../../utils/cn";

export interface StatTileProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function StatTile({
  label,
  value,
  subtext,
  icon,
  trend,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-md flex flex-col justify-between transition-all hover:border-white/15",
        className,
      )}
    >
      <div className="flex items-center justify-between text-slate-400 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider font-mono">{label}</span>
        {icon && <span className="p-1 rounded-md bg-white/[0.04] text-slate-300">{icon}</span>}
      </div>
      <div>
        <div className="text-2xl font-bold font-display text-slate-100 tracking-tight">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend && (
            <span
              className={cn(
                "text-[11px] font-mono font-medium",
                trend.positive ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {trend.value}
            </span>
          )}
          {subtext && <span className="text-[11px] text-slate-500 font-mono">{subtext}</span>}
        </div>
      </div>
    </div>
  );
}
