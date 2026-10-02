import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ className, bordered = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-slate-950/70 backdrop-blur-xl rounded-xl p-5",
          bordered && "border border-white/[0.08]",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Panel.displayName = "Panel";
