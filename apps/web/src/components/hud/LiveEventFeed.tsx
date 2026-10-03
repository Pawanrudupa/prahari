import { useState, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ListFilter,
  ChevronDown,
  ChevronUp,
  Crosshair,
  CheckCircle2,
  EyeOff,
  Clock,
  ShieldX,
} from "lucide-react";
import { useGraphStore } from "../../stores/useGraphStore";
import { Badge } from "../ui/Badge";
import type { DecisionOutcome } from "../../types/graph";

type FilterTab = "all" | DecisionOutcome;

const OUTCOME_ICONS: Record<DecisionOutcome, React.ReactNode> = {
  allow: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  redact: <EyeOff className="w-3 h-3 text-amber-400" />,
  escalate: <Clock className="w-3 h-3 text-purple-400" />,
  deny: <ShieldX className="w-3 h-3 text-rose-400" />,
};

export function LiveEventFeed() {
  const [isOpen, setIsOpen] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const decisions = useGraphStore((s) => s.decisions);
  const selectedDecisionId = useGraphStore((s) => s.selectedDecisionId);
  const selectDecision = useGraphStore((s) => s.selectDecision);
  const selectNode = useGraphStore((s) => s.selectNode);

  // Newest events at top
  const filteredEvents = useMemo(() => {
    const list = [...decisions].reverse();
    if (filter === "all") return list;
    return list.filter((d) => d.outcome === filter);
  }, [decisions, filter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  const handleSelectEvent = (decisionId: string, agentId: string) => {
    selectDecision(decisionId);
    selectNode(agentId); // Fly camera to agent node
  };

  return (
    <aside
      aria-label="Live Event Feed"
      className="w-80 rounded-2xl border border-white/10 bg-slate-950/85 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono select-none"
    >
      {/* Header & Toggle */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.08] bg-slate-900/60">
        <div className="flex items-center gap-2">
          <ListFilter className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-100 font-display">Live Event Feed</span>
          <span className="text-[10px] text-slate-400 bg-white/[0.06] px-1.5 py-0.5 rounded">
            {filteredEvents.length}
          </span>
        </div>

        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-white/5 transition cursor-pointer"
          aria-label={isOpen ? "Collapse event feed" : "Expand event feed"}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Outcome Filter Tabs */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-white/[0.06] bg-slate-900/30 overflow-x-auto">
            {(["all", "allow", "redact", "escalate", "deny"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-2 py-0.5 rounded text-[11px] capitalize transition cursor-pointer ${
                  filter === tab
                    ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Virtualized Event List */}
          <div
            ref={parentRef}
            className="h-64 overflow-y-auto p-1.5 space-y-1 divide-y divide-white/[0.04]"
          >
            {filteredEvents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-[11px] p-4 text-center">
                Waiting for incoming agent tool events...
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const event = filteredEvents[virtualRow.index];
                  if (!event) return null;
                  const isSelected = selectedDecisionId === event.decision_id;

                  return (
                    <div
                      key={event.decision_id || event.action_id || `${virtualRow.index}-${event.audit_seq}`}
                      onClick={() => handleSelectEvent(event.decision_id, event.agent_id)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`p-2 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 border ${
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200"
                          : "border-transparent hover:bg-white/[0.04] text-slate-300"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="p-0.5 rounded bg-white/[0.04]">
                            {OUTCOME_ICONS[event.outcome]}
                          </span>
                          <span className="font-semibold text-slate-100 truncate text-[11px]">
                            {event.agent_name || event.agent_id}
                          </span>
                          <span className="text-[10px] text-slate-500">→</span>
                          <span className="text-slate-300 truncate text-[11px]">
                            {event.tool_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          <span>#{event.audit_seq}</span>
                          <span>•</span>
                          <span>{event.rule_id || "default_deny"}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <Badge variant={event.outcome} size="sm" showIcon={false}>
                          {event.outcome.toUpperCase()}
                        </Badge>
                        <span className="text-[9px] text-slate-500 mt-1 flex items-center gap-0.5">
                          <Crosshair className="w-2.5 h-2.5" /> Fly to
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
