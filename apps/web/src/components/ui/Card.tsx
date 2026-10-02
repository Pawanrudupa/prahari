import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive";
  glow?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", glow = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border transition-all duration-200",
          variant === "default" && "bg-slate-900/60 backdrop-blur-md border-white/[0.08]",
          variant === "elevated" && "bg-slate-900/90 backdrop-blur-xl border-white/[0.12] shadow-2xl",
          variant === "interactive" &&
            "bg-slate-900/60 backdrop-blur-md border-white/[0.08] hover:border-cyan-500/30 hover:bg-slate-900/80 cursor-pointer hover:shadow-[0_0_25px_rgba(56,189,248,0.08)]",
          glow && "shadow-[0_0_30px_rgba(56,189,248,0.1)] border-cyan-500/30",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-6 py-5 border-b border-white/[0.06] flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold text-slate-100 font-display tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-slate-400 mt-1", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-6 py-4 border-t border-white/[0.06] bg-white/[0.01] rounded-b-xl flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}
