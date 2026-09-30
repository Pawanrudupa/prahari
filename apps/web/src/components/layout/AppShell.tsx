import type { ReactNode } from "react";
import { LeftRail } from "./LeftRail";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)]">
      <LeftRail />
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold text-[var(--color-allow)]">Prahari</span>
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-[var(--color-text-muted)]">dev</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[var(--color-allow)]" title="Connected" />
          </div>
        </header>
        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
