import type { ReactNode } from "react";
import { LeftRail } from "./LeftRail";
import { TopBar } from "./TopBar";
import { useEventStream } from "../../hooks/useEventStream";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status, retryCount, reconnect } = useEventStream();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)]">
      <LeftRail />
      <div className="flex flex-1 flex-col">
        <TopBar
          status={status}
          retryCount={retryCount}
          onReconnect={reconnect}
        />
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}

