import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { cn } from "../../utils/cn";

export const ToastProvider = ToastPrimitive.Provider;
export const ToastViewport = () => (
  <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse p-4 sm:max-w-[420px]" />
);

export interface ToastProps extends ToastPrimitive.ToastProps {
  variant?: "default" | "success" | "warning" | "error";
  title?: string;
  description?: string;
}

export function Toast({
  className,
  variant = "default",
  title,
  description,
  children,
  ...props
}: ToastProps) {
  const iconMap = {
    default: <Info className="w-5 h-5 text-cyan-400" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    error: <AlertOctagon className="w-5 h-5 text-rose-400" />,
  };

  return (
    <ToastPrimitive.Root
      className={cn(
        "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-xl backdrop-blur-xl transition-all",
        "bg-slate-900/95 border-white/10 text-slate-100",
        variant === "success" && "border-emerald-500/30 bg-emerald-950/40",
        variant === "warning" && "border-amber-500/30 bg-amber-950/40",
        variant === "error" && "border-rose-500/30 bg-rose-950/40",
        className,
      )}
      {...props}
    >
      <div className="shrink-0 mt-0.5">{iconMap[variant]}</div>
      <div className="flex-1 space-y-1">
        {title && <ToastPrimitive.Title className="text-sm font-semibold font-display">{title}</ToastPrimitive.Title>}
        {description && <ToastPrimitive.Description className="text-xs text-slate-300">{description}</ToastPrimitive.Description>}
        {children}
      </div>
      <ToastPrimitive.Close className="rounded-md p-1 text-slate-400 hover:text-white transition-colors">
        <X className="w-4 h-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
