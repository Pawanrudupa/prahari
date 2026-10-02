import React from "react";
import { cn } from "../../utils/cn";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center font-mono text-[10px] font-semibold text-slate-400 bg-slate-800/80 border border-slate-700/60 rounded px-1.5 py-0.5 shadow-sm select-none",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
