import React from "react";
import {
  CheckCircle2,
  EyeOff,
  Clock,
  ShieldX,
  Bot,
  Wrench,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "../../utils/cn";

export type BadgeVariant =
  | "allow"
  | "redact"
  | "escalate"
  | "deny"
  | "agent"
  | "tool"
  | "warning"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function Badge({
  className,
  variant = "neutral",
  size = "md",
  showIcon = true,
  children,
  ...props
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    allow: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    redact: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/30",
      icon: <EyeOff className="w-3.5 h-3.5" />,
    },
    escalate: {
      bg: "bg-purple-500/10",
      text: "text-purple-400",
      border: "border-purple-500/30",
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    deny: {
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      border: "border-rose-500/30",
      icon: <ShieldX className="w-3.5 h-3.5" />,
    },
    agent: {
      bg: "bg-sky-500/10",
      text: "text-sky-400",
      border: "border-sky-500/30",
      icon: <Bot className="w-3.5 h-3.5" />,
    },
    tool: {
      bg: "bg-slate-700/20",
      text: "text-slate-300",
      border: "border-slate-600/30",
      icon: <Wrench className="w-3.5 h-3.5" />,
    },
    warning: {
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      border: "border-amber-500/30",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    neutral: {
      bg: "bg-slate-800/40",
      text: "text-slate-300",
      border: "border-slate-700/40",
      icon: <Info className="w-3.5 h-3.5" />,
    },
  };

  const style = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-medium rounded-full border transition-colors select-none",
        style.bg,
        style.text,
        style.border,
        size === "sm" ? "px-2 py-0.5 text-[11px] gap-1" : "px-2.5 py-1 text-xs gap-1.5",
        className,
      )}
      {...props}
    >
      {showIcon && <span className="inline-flex shrink-0">{style.icon}</span>}
      <span>{children}</span>
    </span>
  );
}
