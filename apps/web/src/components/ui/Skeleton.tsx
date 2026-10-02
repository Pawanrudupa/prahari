import React from "react";
import { cn } from "../../utils/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/[0.06] border border-white/[0.04]",
        className,
      )}
      {...props}
    />
  );
}
