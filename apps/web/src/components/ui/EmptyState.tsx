import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "../../utils/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon = <Inbox className="w-10 h-10 text-slate-500" />,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-12 rounded-xl border border-white/[0.08] bg-slate-900/30 backdrop-blur-sm",
        className,
      )}
    >
      <div className="p-3 mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">{icon}</div>
      <h4 className="text-base font-semibold text-slate-200 font-display">{title}</h4>
      {description && <p className="text-xs text-slate-400 max-w-sm mt-1.5 mb-5">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
