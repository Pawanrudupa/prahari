import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../utils/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-slate-900/80 p-1 border border-white/[0.08] text-slate-400",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, children, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-all focus-ring disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:border data-[state=active]:border-cyan-500/30 data-[state=active]:shadow-sm",
        "hover:text-slate-200",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, children, ...props }: TabsPrimitive.TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-3 focus-ring", className)}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
