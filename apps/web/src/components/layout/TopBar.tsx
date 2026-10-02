import { ConnectionBanner } from "./ConnectionBanner";
import { useAuthStore } from "../../stores/useAuthStore";
import type { ConnectionStatus } from "../../types/graph";

interface TopBarProps {
  status: ConnectionStatus;
  retryCount: number;
  onReconnect: () => void;
}

export function TopBar({ status, retryCount, onReconnect }: TopBarProps) {
  const mode = useAuthStore((s) => s.mode);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="flex h-12 items-center justify-between border-b border-white/10 px-4 bg-[#070A12]/80 backdrop-blur-sm z-20">
      <div className="flex items-center gap-3">
        <span className="font-bold text-base tracking-tight text-[#2DD4A7]">
          PRAHARI
        </span>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-mono text-white/60">
          {mode === "development-bypass" ? "DEV-BYPASS" : "ADMIN"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ConnectionBanner
          status={status}
          retryCount={retryCount}
          onReconnect={onReconnect}
        />
        <button
          onClick={logout}
          data-testid="logout-button"
          title="Sign out of console (clears in-memory session)"
          className="text-xs font-mono text-white/50 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
