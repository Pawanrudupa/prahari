import type { ConnectionStatus } from "../../types/graph";
import { useGraphStore } from "../../stores/useGraphStore";

interface ConnectionBannerProps {
  status: ConnectionStatus;
  retryCount: number;
  onReconnect: () => void;
}

export function ConnectionBanner({
  status,
  retryCount,
  onReconnect,
}: ConnectionBannerProps) {
  const latestAuditSeq = useGraphStore((s) => s.latestAuditSeq);

  if (status === "connected") {
    return (
      <div
        data-testid="connection-banner"
        className="flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-mono">LIVE • SEQ #{latestAuditSeq}</span>
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div
        data-testid="connection-banner"
        className="flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300"
      >
        <span className="inline-flex rounded-full h-2 w-2 bg-amber-400 animate-pulse"></span>
        <span className="font-mono">CONNECTING...</span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div
        data-testid="connection-banner"
        className="flex items-center gap-3 px-3 py-1 text-xs rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 shadow-lg shadow-amber-950/30"
      >
        <span className="inline-flex rounded-full h-2 w-2 bg-amber-400 animate-ping"></span>
        <span className="font-mono">RECONNECTING (ATTEMPT {retryCount})...</span>
        <button
          onClick={onReconnect}
          className="underline hover:text-white font-medium cursor-pointer"
        >
          RETRY NOW
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="connection-banner"
      className="flex items-center gap-3 px-3 py-1 text-xs rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-300 shadow-lg shadow-rose-950/30"
    >
      <span className="inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
      <span className="font-mono">DISCONNECTED</span>
      <button
        onClick={onReconnect}
        className="underline hover:text-white font-medium cursor-pointer"
      >
        RECONNECT
      </button>
    </div>
  );
}
