import type { ConnectionStatus } from "../../types/graph";
import { useGraphStore } from "../../stores/useGraphStore";

interface ConnectionBannerProps {
  status: ConnectionStatus;
  retryCount: number;
  error?: string | null;
  dataLoaded?: boolean;
  isLoadingSnapshot?: boolean;
  onReconnect: () => void;
}

export function ConnectionBanner({
  status,
  retryCount,
  error,
  dataLoaded = false,
  isLoadingSnapshot = false,
  onReconnect,
}: ConnectionBannerProps) {
  const latestAuditSeq = useGraphStore((s) => s.latestAuditSeq);
  const agentCount = useGraphStore((s) => s.agents.size);
  const toolCount = useGraphStore((s) => s.tools.size);

  if (status === "error" || error) {
    return (
      <div
        data-testid="connection-banner"
        className="flex items-center gap-3 px-3 py-1 text-xs rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-300 shadow-lg shadow-rose-950/30"
      >
        <span className="inline-flex rounded-full h-2 w-2 bg-rose-500 animate-pulse"></span>
        <span className="font-mono text-[11px] truncate max-w-[240px]">
          {error || "ERROR OCCURRED"}
        </span>
        <button
          onClick={onReconnect}
          className="underline hover:text-white font-medium cursor-pointer"
        >
          RETRY
        </button>
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

  if (status === "connected") {
    if (isLoadingSnapshot || !dataLoaded) {
      return (
        <div
          data-testid="connection-banner"
          className="flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-sky-950/60 border border-sky-500/30 text-sky-300"
        >
          <span className="inline-flex rounded-full h-2 w-2 bg-sky-400 animate-pulse"></span>
          <span className="font-mono">CONNECTED • LOADING TOPOLOGY...</span>
        </div>
      );
    }

    if (agentCount === 0 && toolCount === 0) {
      return (
        <div
          data-testid="connection-banner"
          className="flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300"
          title="WebSocket live, but 0 agents or tools configured in database. Run simulator or provision agents."
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
          </span>
          <span className="font-mono">LIVE • 0 AGENTS CONFIGURED • SEQ #{latestAuditSeq}</span>
        </div>
      );
    }

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
