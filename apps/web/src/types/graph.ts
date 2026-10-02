export type DecisionOutcome = "allow" | "deny" | "redact" | "escalate";

export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  owner: string;
  status: string;
  activityCount?: number;
  riskScore?: number;
  pendingEscalations?: number;
  position?: [number, number, number];
}

export interface ToolNode {
  id: string;
  name: string;
  server: string;
  sensitivity: string;
  position?: [number, number, number];
}

export interface GrantEdge {
  agent_id: string;
  tool_id: string;
}

export interface DecisionEvent {
  decision_id: string;
  action_id: string;
  agent_id: string;
  agent_name: string;
  tool_id: string;
  outcome: DecisionOutcome;
  rule_id: string | null;
  risk_score: number;
  session_id: string | null;
  parent_action_id: string | null;
  audit_seq: number;
  data_classes: string[];
  latency_ms: number;
  timestamp?: string;
}

export interface GraphSnapshot {
  latest_audit_seq: number;
  agents: AgentNode[];
  tools: ToolNode[];
  grants: GrantEdge[];
  recent_decisions: DecisionEvent[];
}

export interface EventEnvelope {
  event_id: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}
