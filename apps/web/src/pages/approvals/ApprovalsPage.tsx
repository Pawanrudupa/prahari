import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { Badge } from "../../components/ui/Badge";

interface ApprovalItem {
  id: string;
  decision_id: string;
  agent_id: string;
  agent_name: string;
  tool_id: string;
  tool_name: string;
  status: "pending" | "approved" | "denied" | "expired";
  args_hash: string;
  risk_score: number;
  rule_id: string;
  reason: string;
  token_consumed: boolean;
  token_expires_at: string | null;
  created_at: string;
}

export function ApprovalsPage() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const mode = useAuthStore((s) => s.mode);
  const isDevEnv = useAuthStore((s) => s.isDevEnv);
  const resolveEscalation = useGraphStore((s) => s.resolveEscalation);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionNote, setActionNote] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const authHeaders: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (sessionToken) {
      h.Authorization = `Bearer ${sessionToken}`;
    }
    return h;
  }, [sessionToken]);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/v1/approvals?status=${statusFilter}`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const reqId = res.headers.get("x-request-id") || undefined;
        throw new Error(`Failed to load approvals: HTTP ${res.status} (Req ID: ${reqId || "n/a"})`);
      }
      const data: ApprovalItem[] = await res.json();
      setApprovals(data);
      setSelectedIndex(0);
    } catch (err: any) {
      setError({ message: err.message });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, authHeaders]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const currentApproval = approvals[selectedIndex] ?? null;

  const handleDecide = useCallback(
    async (decision: "approve" | "deny") => {
      if (!currentApproval || actionLoading) return;
      setActionLoading(true);
      setActionSuccess(null);
      setError(null);

      try {
        const res = await fetch(`/v1/approvals/${currentApproval.id}/decide`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({
            decision,
            note: actionNote.trim() || `Human reviewer decision: ${decision}`,
          }),
        });

        if (!res.ok) {
          const reqId = res.headers.get("x-request-id") || undefined;
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status} (Req ID: ${reqId || "n/a"})`);
        }

        const result = await res.json();
        // Clear escalation badge in global store
        resolveEscalation(currentApproval.agent_id);

        setActionSuccess(
          decision === "approve"
            ? `Approved successfully! Issued single-use token: ${result.approval_token.slice(0, 16)}...`
            : "Request denied by governance operator.",
        );
        setActionNote("");

        // Refresh list
        setTimeout(() => {
          fetchApprovals();
        }, 1200);
      } catch (err: any) {
        setError({ message: err.message });
      } finally {
        setActionLoading(false);
      }
    },
    [currentApproval, actionLoading, authHeaders, actionNote, resolveEscalation, fetchApprovals],
  );

  // Keyboard navigation shortcuts (A approve, D deny, J/K or arrows prev/next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing into input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (currentApproval?.status === "pending") handleDecide("approve");
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (currentApproval?.status === "pending") handleDecide("deny");
      } else if (e.key === "j" || e.key === "J" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(approvals.length - 1, prev + 1));
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [approvals.length, currentApproval, handleDecide]);

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950 p-6 md:p-8 font-mono text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Clock className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white font-display">
                Human Approvals Queue
              </h1>
              {approvals.length > 0 && statusFilter === "pending" && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold animate-pulse">
                  {approvals.length} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Role-governed escalation pod. Approving generates a single-use, 5-minute cryptographic token bound to agent and argument hash.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
            {(["pending", "approved", "denied", "expired", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg capitalize transition cursor-pointer ${
                  statusFilter === tab
                    ? "bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
            <button
              onClick={fetchApprovals}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 transition cursor-pointer ml-1"
              title="Refresh approvals"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-purple-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 rounded-xl bg-slate-900/40 border border-white/[0.06] text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-bold">A</kbd>
              <span>Approve</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-bold">D</kbd>
              <span>Deny</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-bold">J</kbd> /
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-bold">K</kbd>
              <span>Next / Prev Card</span>
            </span>
          </div>
          <span className="text-slate-500 text-[10px]">Role: {mode || "admin"} (Approver authorized)</span>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error.message}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-200 px-2 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Action Success Alert */}
        {actionSuccess && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Main Deck Container */}
        {loading ? (
          <div className="h-96 rounded-2xl border border-white/[0.08] bg-slate-900/30 p-8 flex flex-col items-center justify-center gap-3 animate-pulse">
            <Clock className="w-8 h-8 text-purple-400/50 animate-spin" />
            <span className="text-xs text-slate-500">Loading escalation deck...</span>
          </div>
        ) : approvals.length === 0 ? (
          <div className="h-96 rounded-2xl border border-dashed border-white/10 bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-2xl bg-white/[0.04] text-slate-500 mb-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/60" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 font-display">Queue Clear</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              No approvals match status &quot;{statusFilter}&quot;. High-risk actions will trigger human-in-the-loop escalation cards here.
            </p>
            {isDevEnv && (
              <p className="text-[11px] text-cyan-400 mt-4 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                Tip: Click &quot;Bulk Export&quot; in the Simulator Controller to generate an escalation request.
              </p>
            )}
          </div>
        ) : currentApproval ? (
          <div className="space-y-4">
            {/* Carousel Navigation Header */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">
                Card {selectedIndex + 1} of {approvals.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                  disabled={selectedIndex === 0}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedIndex((prev) => Math.min(approvals.length - 1, prev + 1))}
                  disabled={selectedIndex === approvals.length - 1}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Approval Decision Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl p-6 shadow-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                      Escalation Decision
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">ID: {currentApproval.id.slice(0, 8)}...</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                    <span>{currentApproval.agent_name}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-cyan-300">{currentApproval.tool_name}</span>
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={currentApproval.status === "approved" ? "allow" : currentApproval.status === "denied" ? "deny" : "escalate"}>
                    {currentApproval.status.toUpperCase()}
                  </Badge>
                  {currentApproval.risk_score > 0 && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Risk: {(currentApproval.risk_score * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-2">
                  <div className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    Governance Trigger
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Trigger Rule:</span>
                    <span className="font-semibold text-slate-200">{currentApproval.rule_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Trigger Reason:</span>
                    <span className="text-slate-300 text-right">{currentApproval.reason}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Created:</span>
                    <span className="text-slate-400">{new Date(currentApproval.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-2">
                  <div className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    Cryptographic Integrity
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Args SHA-256:</span>
                    <span className="font-mono text-cyan-400 text-[11px] truncate max-w-[200px]" title={currentApproval.args_hash}>
                      {currentApproval.args_hash}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Token Status:</span>
                    <span className="text-slate-300">
                      {currentApproval.token_consumed ? "Single-use token consumed" : "Unconsumed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expires At:</span>
                    <span className="text-slate-400">
                      {currentApproval.token_expires_at
                        ? new Date(currentApproval.token_expires_at).toLocaleTimeString()
                        : "5m from approval"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approver Decision Pod (Active for pending cards) */}
              {currentApproval.status === "pending" ? (
                <div className="pt-4 border-t border-white/[0.08] space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium">
                      Reviewer Authorization Note (Audited)
                    </label>
                    <input
                      type="text"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder="e.g. Authorized by Compliance Lead for Q4 Financial Audit"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDecide("approve")}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Approve Tool Call (A)</span>
                    </button>

                    <button
                      onClick={() => handleDecide("deny")}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Deny Execution (D)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-400 text-center">
                  This escalation card was finalized as <span className="font-semibold text-slate-200 uppercase">{currentApproval.status}</span>.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
