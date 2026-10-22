import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layers,
  Play,
  Download,
  Bot,
  Sliders,
  X,
  ArrowDown,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { Badge } from "../../components/ui/Badge";

interface SessionListItem {
  id: string;
  agent_id: string;
  agent_name: string;
  goal: string | null;
  started_at: string;
  ended_at: string | null;
  action_count: number;
}

interface DagNode {
  id: string;
  type: "session_root" | "action" | "decision";
  label: string;
  tool?: string;
  outcome?: "allow" | "redact" | "escalate" | "deny";
  rule_id?: string | null;
  seq?: number;
  data_classes?: string[];
  latency_ms?: number;
  purpose?: string | null;
  created_at?: string;
}

interface DagEdge {
  source: string;
  target: string;
}

interface SessionGraphResponse {
  session_id: string;
  goal: string | null;
  nodes: DagNode[];
  edges: DagEdge[];
}

export function SessionDagPage() {
  const sessionToken = useAuthStore((s) => s.sessionToken);

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<SessionGraphResponse | null>(null);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [loadingGraph, setLoadingGraph] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Timeline Scrubber state
  const [timelineStep, setTimelineStep] = useState<number>(999);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);

  // Detail Drawer state
  const [selectedNode, setSelectedNode] = useState<DagNode | null>(null);

  // 2D vs 3D Mode toggle
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  const authHeaders: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (sessionToken) {
      h.Authorization = `Bearer ${sessionToken}`;
    }
    return h;
  }, [sessionToken]);

  // 1. Fetch sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await fetch("/v1/sessions", { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SessionListItem[] = await res.json();
      setSessions(data);
      if (data.length > 0 && !selectedSessionId && data[0]) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err: any) {
      setError(`Failed to load sessions: ${err.message}`);
    } finally {
      setLoadingSessions(false);
    }
  }, [authHeaders, selectedSessionId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 2. Fetch session graph
  useEffect(() => {
    if (!selectedSessionId) return;
    setLoadingGraph(true);
    setError(null);
    setSelectedNode(null);

    fetch(`/v1/sessions/${selectedSessionId}/graph`, { headers: authHeaders })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SessionGraphResponse) => {
        setGraphData(data);
        const actionNodes = data.nodes.filter((n) => n.type === "action");
        setTimelineStep(actionNodes.length || 1);
      })
      .catch((err) => setError(`Failed to load DAG graph: ${err.message}`))
      .finally(() => setLoadingGraph(false));
  }, [selectedSessionId, authHeaders]);

  // Timeline Scrubber animation player
  useEffect(() => {
    if (!isPlayingTimeline || !graphData) return;
    const actionNodes = graphData.nodes.filter((n) => n.type === "action");
    const interval = setInterval(() => {
      setTimelineStep((prev) => {
        if (prev >= actionNodes.length) {
          setIsPlayingTimeline(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlayingTimeline, graphData]);

  // Filter visible nodes by timeline step
  const visibleNodes = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter((n) => {
      if (n.type === "session_root") return true;
      if (n.seq !== undefined) return n.seq <= timelineStep;
      return true;
    });
  }, [graphData, timelineStep]);

  // Export session JSON
  const handleExportJson = () => {
    if (!graphData) return;
    const blob = new Blob([JSON.stringify(graphData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${graphData.session_id.slice(0, 8)}-dag.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionCount = useMemo(() => {
    return graphData?.nodes.filter((n) => n.type === "action").length || 0;
  }, [graphData]);

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950 p-6 md:p-8 font-mono text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Layers className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white font-display">
                Session Workflow DAG
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-xs font-semibold">
                Hierarchical Lineage
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic causal tree tracing agent goals, parent/child tool calls, and step-by-step governance decisions.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode((m) => (m === "2d" ? "3d" : "2d"))}
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-300 transition cursor-pointer flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>View: {viewMode.toUpperCase()}</span>
            </button>

            <button
              onClick={handleExportJson}
              disabled={!graphData}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs text-cyan-200 font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Sessions Selector Bar */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 border-b border-white/[0.06]">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider shrink-0">
            Workflows:
          </span>
          {loadingSessions ? (
            <span className="text-xs text-slate-500 animate-pulse">Loading workflows...</span>
          ) : sessions.length === 0 ? (
            <span className="text-xs text-slate-500">No session workflows recorded</span>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap transition cursor-pointer flex items-center gap-2 ${
                  selectedSessionId === s.id
                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-200 font-semibold"
                    : "bg-slate-900/40 border-white/[0.06] text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{s.agent_name}</span>
                <span className="text-[10px] text-slate-500">({s.action_count} steps)</span>
              </button>
            ))
          )}
        </div>

        {/* Main Canvas & Timeline Container */}
        {loadingGraph ? (
          <div className="h-[480px] rounded-2xl border border-white/[0.08] bg-slate-900/30 p-8 flex flex-col items-center justify-center gap-3 animate-pulse">
            <Layers className="w-8 h-8 text-cyan-400/50 animate-spin" />
            <span className="text-xs text-slate-500">Rendering causal DAG...</span>
          </div>
        ) : !graphData || graphData.nodes.length === 0 ? (
          <div className="h-[480px] rounded-2xl border border-dashed border-white/10 bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
            <Layers className="w-8 h-8 text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-300 font-display">No Workflow Graph Available</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Select an active workflow from above or run a multi-step session scenario from the Simulator.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline Scrubber Bar */}
            <div className="p-3.5 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlayingTimeline((p) => !p)}
                  className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/30 transition cursor-pointer flex items-center gap-1"
                >
                  <Play className={`w-3.5 h-3.5 ${isPlayingTimeline ? "animate-pulse" : ""}`} />
                  <span>{isPlayingTimeline ? "Pause" : "Play Flow"}</span>
                </button>

                <button
                  onClick={() => setTimelineStep(actionCount)}
                  className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  Show Full DAG
                </button>
              </div>

              {/* Slider Controls */}
              <div className="flex-1 max-w-md flex items-center gap-3">
                <span className="text-slate-400 text-[11px]">Step:</span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, actionCount)}
                  value={Math.min(timelineStep, Math.max(1, actionCount))}
                  onChange={(e) => {
                    setIsPlayingTimeline(false);
                    setTimelineStep(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <span className="font-bold text-cyan-300 min-w-[36px] text-right">
                  {Math.min(timelineStep, Math.max(1, actionCount))} / {actionCount}
                </span>
              </div>
            </div>

            {/* DAG Canvas View */}
            <div className="relative h-[480px] rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl overflow-hidden shadow-2xl p-6 flex flex-col items-center justify-start overflow-y-auto">
              <div className="w-full max-w-2xl flex flex-col items-center gap-4">
                {visibleNodes.map((node, idx) => {
                  const isRoot = node.type === "session_root";
                  const isSelected = selectedNode?.id === node.id;

                  return (
                    <div key={node.id} className="w-full flex flex-col items-center">
                      {/* Connection Edge Line */}
                      {idx > 0 && (
                        <div className="flex flex-col items-center my-1">
                          <div className="w-[2px] h-6 bg-gradient-to-b from-cyan-500/40 to-cyan-500/80" />
                          <ArrowDown className="w-3.5 h-3.5 text-cyan-400 -mt-1" />
                        </div>
                      )}

                      {/* Node Card */}
                      <div
                        onClick={() => setSelectedNode(node)}
                        className={`w-full p-4 rounded-xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                          isSelected
                            ? "bg-cyan-500/15 border-cyan-400/60 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                            : isRoot
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-200"
                              : "bg-slate-900/80 border-white/[0.08] hover:border-cyan-500/30 text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg ${
                              isRoot
                                ? "bg-purple-500/20 text-purple-300"
                                : "bg-cyan-500/10 text-cyan-300"
                            }`}
                          >
                            {isRoot ? <Bot className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{node.label}</span>
                              {node.seq !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Step #{node.seq}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 max-w-md truncate">
                              {node.purpose || graphData.goal || "Autonomous goal step"}
                            </div>
                          </div>
                        </div>

                        {/* Outcome Badge */}
                        {node.outcome && (
                          <div className="flex flex-col items-end shrink-0">
                            <Badge variant={node.outcome} size="sm">
                              {node.outcome.toUpperCase()}
                            </Badge>
                            {node.latency_ms !== undefined && (
                              <span className="text-[10px] text-slate-500 mt-1">
                                {node.latency_ms.toFixed(1)} ms
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Node Detail Slide-Over Drawer */}
        {selectedNode && (
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-950 border-l border-white/10 shadow-2xl p-6 flex flex-col justify-between font-mono">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-white text-sm">Action Decision Detail</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Node ID</span>
                  <div className="font-mono text-cyan-300 text-[11px] break-all mt-0.5">
                    {selectedNode.id}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Action Purpose</span>
                  <div className="text-slate-200 mt-0.5">
                    {selectedNode.purpose || "No custom purpose supplied"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Outcome</span>
                    <div className="mt-1">
                      {selectedNode.outcome ? (
                        <Badge variant={selectedNode.outcome}>{selectedNode.outcome.toUpperCase()}</Badge>
                      ) : (
                        <span className="text-slate-400">Root</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Rule Evaluated</span>
                    <div className="text-slate-200 font-semibold mt-1">
                      {selectedNode.rule_id || "None / Default"}
                    </div>
                  </div>
                </div>

                {selectedNode.data_classes && selectedNode.data_classes.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">PII Data Classes</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedNode.data_classes.map((dc) => (
                        <span
                          key={dc}
                          className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]"
                        >
                          {dc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedNode(null)}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              Close Detail Drawer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
