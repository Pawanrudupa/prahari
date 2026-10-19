import { useState, useRef, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  History,
  ShieldCheck,
  ShieldX,
  Clock,
  EyeOff,
  CheckCircle2,
  AlertOctagon,
  Search,
  RefreshCw,
  X,
  Copy,
  Check,
  Play,
  FileCheck2,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/Dialog";

interface DecisionRecord {
  id: string;
  seq: number;
  prev_hash: string;
  hash: string;
  action_id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  tool: string;
  outcome: "allow" | "redact" | "escalate" | "deny";
  rule_id: string | null;
  reason: string;
  risk_score: number;
  data_classes: string[];
  args_hash: string;
  timestamp: string;
  created_at: string;
  raw_payload: Record<string, unknown>;
}

interface DecisionsResponse {
  items: DecisionRecord[];
  next_cursor: number | null;
  has_more: boolean;
  total_count: number | null;
}

interface VerificationResult {
  valid: boolean;
  records_verified: number;
  head_seq: number;
  head_hash: string;
  checkpoints_verified: number;
  errors: string[];
}

export function DecisionsPage() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const mode = useAuthStore((s) => s.mode);
  const isDev = mode === "development-bypass" || import.meta.env.DEV;
  const errorId = useId();

  // Filters
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [toolFilter, setToolFilter] = useState<string>("");
  const [ruleFilter, setRuleFilter] = useState<string>("");

  // Drawer & Modal
  const [selectedDecision, setSelectedDecision] = useState<DecisionRecord | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Query: Decisions list
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<DecisionsResponse>({
    queryKey: ["decisions", outcomeFilter, agentFilter, toolFilter, ruleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
      if (agentFilter.trim()) params.set("agent", agentFilter.trim());
      if (toolFilter.trim()) params.set("tool", toolFilter.trim());
      if (ruleFilter.trim()) params.set("rule_id", ruleFilter.trim());

      const res = await fetch(`/v1/decisions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch decisions");
      return res.json();
    },
    refetchInterval: 8_000,
  });

  const decisions = data?.items || [];

  // Query: Chain Verification (on demand)
  const {
    data: verifyResult,
    isLoading: verifyLoading,
    refetch: triggerVerify,
  } = useQuery<VerificationResult>({
    queryKey: ["audit-verify"],
    queryFn: async () => {
      const res = await fetch("/v1/audit/verify", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to verify audit chain");
      return res.json();
    },
    enabled: false,
  });

  const handleOpenVerify = () => {
    setVerifyDialogOpen(true);
    triggerVerify();
  };

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: decisions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome.toLowerCase()) {
      case "allow":
        return (
          <Badge variant="allow">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            ALLOW
          </Badge>
        );
      case "redact":
        return (
          <Badge variant="redact">
            <EyeOff className="w-3.5 h-3.5 mr-1 text-amber-400" />
            REDACT
          </Badge>
        );
      case "escalate":
        return (
          <Badge variant="escalate">
            <Clock className="w-3.5 h-3.5 mr-1 text-violet-400" />
            ESCALATE
          </Badge>
        );
      case "deny":
      default:
        return (
          <Badge variant="deny">
            <ShieldX className="w-3.5 h-3.5 mr-1 text-rose-400" />
            DENY
          </Badge>
        );
    }
  };

  const handleCopyPayload = () => {
    if (!selectedDecision) return;
    navigator.clipboard.writeText(JSON.stringify(selectedDecision.raw_payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-slate-100 flex items-center gap-2.5">
            <History className="w-6 h-6 text-sky-400" />
            Decisions & Audit Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tamper-evident, hash-chained record of all agent tool execution decisions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} isLoading={isFetching}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Button variant="accent" size="sm" onClick={handleOpenVerify}>
            <FileCheck2 className="w-4 h-4 mr-1.5" />
            Verify Chain
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Outcome Filter Pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-slate-400 mr-1">Outcome:</span>
            {["all", "allow", "redact", "escalate", "deny"].map((out) => (
              <button
                key={out}
                onClick={() => setOutcomeFilter(out)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all border ${
                  outcomeFilter === out
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                    : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-white/[0.04]"
                }`}
              >
                {out}
              </button>
            ))}
          </div>

          {/* Search Inputs */}
          <div className="flex items-center gap-2 flex-1 max-w-lg justify-end">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter by agent..."
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Filter tool (e.g. crm)..."
                value={toolFilter}
                onChange={(e) => setToolFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Rule ID (e.g. R1)..."
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Decisions View: Virtualized Table or Empty/Error */}
      {isLoading ? (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : isError ? (
        <Card className="p-6 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold">Failed to query decision logs</h4>
              <p className="text-xs text-rose-300/80 mt-0.5">
                Request ID: <code className="font-mono">{errorId}</code>
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            Retry Query
          </Button>
        </Card>
      ) : decisions.length === 0 ? (
        <EmptyState
          icon={<History className="w-10 h-10 text-slate-500" />}
          title="No decisions recorded"
          description="Dispatch traffic through the proxy gateway or launch the simulator to generate audit events."
          action={
            isDev ? (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await fetch("/v1/dev/simulate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scenario: "all", count: 20, seed: 42 }),
                  });
                  refetch();
                }}
              >
                <Play className="w-4 h-4 mr-1.5" />
                Run Simulator (Dev)
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="bg-slate-900/80 border-b border-white/[0.08] text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center px-4 py-3 select-none">
            <div className="w-16">Seq #</div>
            <div className="w-28">Outcome</div>
            <div className="w-40">Agent</div>
            <div className="w-48">Tool</div>
            <div className="w-32">Rule Trigger</div>
            <div className="flex-1">Reason / Detail</div>
            <div className="w-36 text-right">Timestamp</div>
          </div>

          <div
            ref={parentRef}
            className="overflow-auto max-h-[580px] divide-y divide-white/[0.04]"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = decisions[virtualRow.index];
                if (!item) return null;
                const isSelected = selectedDecision?.id === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDecision(item)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex items-center px-4 text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-cyan-500/10 border-l-2 border-cyan-400"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="w-16 font-mono text-slate-500">#{item.seq}</div>
                    <div className="w-28">{getOutcomeBadge(item.outcome)}</div>
                    <div className="w-40 font-semibold text-slate-200 truncate pr-2">
                      {item.agent_name}
                    </div>
                    <div className="w-48 font-mono text-sky-400 truncate pr-2">{item.tool}</div>
                    <div className="w-32 font-mono text-slate-400 text-[11px] truncate">
                      {item.rule_id || "default"}
                    </div>
                    <div className="flex-1 text-slate-400 truncate pr-4 text-[11px]">
                      {item.reason}
                    </div>
                    <div className="w-36 text-right font-mono text-[11px] text-slate-500">
                      {new Date(item.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Slide-over Detail Drawer */}
      {selectedDecision && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-950/95 backdrop-blur-2xl border-l border-white/[0.1] shadow-2xl z-50 p-6 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="font-mono text-sm text-cyan-400">
                  Decision #{selectedDecision.seq}
                </div>
                {getOutcomeBadge(selectedDecision.outcome)}
              </div>
              <button
                onClick={() => setSelectedDecision(null)}
                className="p-1 rounded-lg hover:bg-white/[0.05] text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core Fields */}
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Agent:</span>
                <span className="font-semibold text-slate-200">{selectedDecision.agent_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Target Tool:</span>
                <span className="font-mono text-sky-400">{selectedDecision.tool}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Rule Trigger:</span>
                <span className="font-mono text-slate-300">
                  {selectedDecision.rule_id || "default_deny"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Decision Reason:</span>
                <span className="text-slate-300 max-w-xs text-right">
                  {selectedDecision.reason || "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Detected PII:</span>
                <span>
                  {selectedDecision.data_classes.length > 0 ? (
                    selectedDecision.data_classes.map((cls) => (
                      <span
                        key={cls}
                        className="px-1.5 py-0.5 ml-1 bg-amber-500/20 text-amber-300 rounded text-[10px] font-mono"
                      >
                        {cls}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-600 font-mono">none</span>
                  )}
                </span>
              </div>
            </div>

            {/* Cryptographic Hashes */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Cryptographic Audit Integrity
              </h4>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-white/[0.06] space-y-2 text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">RECORD HASH (SHA-256):</span>
                  <span className="text-emerald-400 break-all">{selectedDecision.hash}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">PREVIOUS RECORD HASH:</span>
                  <span className="text-slate-400 break-all">{selectedDecision.prev_hash}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ARGUMENTS HASH:</span>
                  <span className="text-slate-400 break-all">{selectedDecision.args_hash}</span>
                </div>
              </div>
            </div>

            {/* Raw JSON Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                  Canonical Audit Payload
                </h4>
                <Button variant="ghost" size="sm" onClick={handleCopyPayload}>
                  {copiedPayload ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
              <pre className="p-3 bg-black/60 rounded-xl border border-white/[0.08] text-[10px] font-mono text-slate-300 overflow-x-auto max-h-48 select-all">
                {JSON.stringify(selectedDecision.raw_payload, null, 2)}
              </pre>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.08] flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setSelectedDecision(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Dialog: Cryptographic Chain Verification Report */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-cyan-400" />
              Audit Chain Cryptographic Verification
            </DialogTitle>
          </DialogHeader>

          {verifyLoading ? (
            <div className="py-8 space-y-3 text-center">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400">
                Recalculating hash chain and verifying HMAC checkpoints...
              </p>
            </div>
          ) : verifyResult ? (
            <div className="space-y-4 py-2 text-xs">
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 ${
                  verifyResult.valid
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {verifyResult.valid ? (
                  <ShieldCheck className="w-6 h-6 flex-shrink-0 text-emerald-400" />
                ) : (
                  <AlertOctagon className="w-6 h-6 flex-shrink-0 text-rose-400" />
                )}
                <div>
                  <h4 className="font-semibold text-sm">
                    {verifyResult.valid
                      ? "Cryptographic Integrity Verified"
                      : "Audit Chain Tampering Detected"}
                  </h4>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {verifyResult.valid
                      ? "All hash chains, sequential sequence numbers, and HMAC checkpoints match."
                      : "Audit sequence is broken or record hash does not match previous head."}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-white/[0.08] space-y-2 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Records Verified:</span>
                  <span className="text-slate-200 font-semibold">
                    {verifyResult.records_verified}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Checkpoints Checked:</span>
                  <span className="text-slate-200">{verifyResult.checkpoints_verified}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Head Sequence:</span>
                  <span className="text-cyan-400">#{verifyResult.head_seq}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">HEAD HASH:</span>
                  <span className="text-slate-400 break-all text-[10px]">
                    {verifyResult.head_hash}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-rose-400 py-4">Verification failed to execute.</p>
          )}

          <DialogFooter>
            <Button variant="primary" size="sm" onClick={() => setVerifyDialogOpen(false)}>
              Close Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
