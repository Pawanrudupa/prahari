import { useState, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Wrench,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Play,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/Tabs";

interface AgentItem {
  id: string;
  name: string;
  owner: string;
  role: string | null;
  status: "active" | "disabled";
  created_at: string;
}

interface ToolItem {
  id: string;
  name: string;
  server: string;
  sensitivity: string | null;
}

interface ActivityPoint {
  timestamp: string;
  count: number;
  allow: number;
  redact: number;
  escalate: number;
  deny: number;
}

interface ActivityResponse {
  agent_id: string;
  window: string;
  points: ActivityPoint[];
}

function ActivitySparkline({ agentId }: { agentId: string }) {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const { data } = useQuery<ActivityResponse>({
    queryKey: ["agent-activity", agentId],
    queryFn: async () => {
      const res = await fetch(`/v1/agents/${agentId}/activity?window=24h`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    staleTime: 10_000,
  });

  if (!data || data.points.length === 0) {
    return <span className="text-[10px] text-slate-600 font-mono">No calls in 24h</span>;
  }

  const counts = data.points.map((p) => p.count);
  const max = Math.max(...counts, 1);
  const width = 100;
  const height = 24;
  const step = width / (counts.length - 1 || 1);

  const pointsStr = counts
    .map((c, i) => `${(i * step).toFixed(1)},${(height - (c / max) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");

  const totalCalls = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsStr}
        />
      </svg>
      <span className="text-[11px] font-mono text-slate-400">{totalCalls} calls</span>
    </div>
  );
}

export function AgentsPage() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const mode = useAuthStore((s) => s.mode);
  const isDev = mode === "development-bypass" || import.meta.env.DEV;
  const queryClient = useQueryClient();
  const errorId = useId();

  const [activeTab, setActiveTab] = useState<string>("agents");
  const [selectedAgentForGrants, setSelectedAgentForGrants] = useState<string | null>(null);

  // Modal dialog states
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [createToolOpen, setCreateToolOpen] = useState(false);
  const [addGrantOpen, setAddGrantOpen] = useState(false);
  const [selectedToolToGrant, setSelectedToolToGrant] = useState("");
  const [keyReveal, setKeyReveal] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentOwner, setNewAgentOwner] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("support");
  const [newToolName, setNewToolName] = useState("");
  const [newToolServer, setNewToolServer] = useState("");
  const [newToolSensitivity, setNewToolSensitivity] = useState("normal");

  // Query: Agents
  const {
    data: agents = [],
    isLoading: agentsLoading,
    isError: agentsError,
    refetch: refetchAgents,
  } = useQuery<AgentItem[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/v1/agents", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });

  // Query: Tools
  const {
    data: tools = [],
    refetch: refetchTools,
  } = useQuery<ToolItem[]>({
    queryKey: ["tools"],
    queryFn: async () => {
      const res = await fetch("/v1/tools", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch tools");
      return res.json();
    },
  });

  // Effective selected agent for grants
  const currentGrantAgentId = selectedAgentForGrants || (agents.length > 0 ? agents[0]?.id : null);

  // Query: Grants for selected agent
  const { data: agentGrants = [], isLoading: grantsLoading } = useQuery<ToolItem[]>({
    queryKey: ["agent-grants", currentGrantAgentId],
    queryFn: async () => {
      if (!currentGrantAgentId) return [];
      const res = await fetch(`/v1/agents/${currentGrantAgentId}/grants`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch grants");
      return res.json();
    },
    enabled: !!currentGrantAgentId,
  });

  // Mutation: Status Toggle
  const statusMutation = useMutation({
    mutationFn: async ({ agentId, status }: { agentId: string; status: "active" | "disabled" }) => {
      const res = await fetch(`/v1/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  // Mutation: Rotate Key
  const rotateKeyMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/v1/agents/${agentId}/rotate-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to rotate key");
      return res.json();
    },
    onSuccess: (data) => {
      setKeyReveal({ name: data.name, key: data.api_key });
      setCopied(false);
    },
  });

  // Mutation: Create Agent
  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/v1/agents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newAgentName,
          owner: newAgentOwner,
          role: newAgentRole,
        }),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      return res.json();
    },
    onSuccess: (data) => {
      setCreateAgentOpen(false);
      setNewAgentName("");
      setNewAgentOwner("");
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setKeyReveal({ name: data.name, key: data.api_key });
      setCopied(false);
    },
  });

  // Mutation: Create Tool
  const createToolMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/v1/tools", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newToolName,
          server: newToolServer,
          sensitivity: newToolSensitivity,
        }),
      });
      if (!res.ok) throw new Error("Failed to register tool");
      return res.json();
    },
    onSuccess: () => {
      setCreateToolOpen(false);
      setNewToolName("");
      setNewToolServer("");
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  // Mutation: Add Grant
  const addGrantMutation = useMutation({
    mutationFn: async () => {
      if (!currentGrantAgentId || !selectedToolToGrant) return;
      const res = await fetch(`/v1/agents/${currentGrantAgentId}/grants`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool_id: selectedToolToGrant }),
      });
      if (!res.ok) throw new Error("Failed to grant tool");
      return res.json();
    },
    onSuccess: () => {
      setAddGrantOpen(false);
      setSelectedToolToGrant("");
      queryClient.invalidateQueries({ queryKey: ["agent-grants", currentGrantAgentId] });
    },
  });

  // Mutation: Revoke Grant
  const revokeGrantMutation = useMutation({
    mutationFn: async (toolId: string) => {
      if (!currentGrantAgentId) return;
      const res = await fetch(`/v1/agents/${currentGrantAgentId}/grants/${toolId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error("Failed to revoke grant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-grants", currentGrantAgentId] });
    },
  });

  // Simulator CTA trigger
  const runSimulatorMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/v1/dev/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "all", count: 15, seed: 42 }),
      });
      if (!res.ok) throw new Error("Simulation failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  const handleCopyKey = () => {
    if (!keyReveal) return;
    navigator.clipboard.writeText(keyReveal.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-slate-100 flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-sky-400" />
            Agents & Tools Registry
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage authorized autonomous agents, capability grants, and registered MCP tool servers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAgents();
              refetchTools();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateAgentOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Register Agent
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Registered Agents ({agents.length})
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Capability Grants & Tools
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Registered Agents */}
        <TabsContent value="agents">
          {agentsLoading ? (
            <Card className="p-6 space-y-3">
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </Card>
          ) : agentsError ? (
            <Card className="p-6 border-rose-500/30 bg-rose-500/5">
              <div className="flex items-center gap-3 text-rose-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold">Failed to load agents</h4>
                  <p className="text-xs text-rose-300/80 mt-0.5">
                    Request ID: <code className="font-mono">{errorId}</code>
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchAgents()}>
                Retry
              </Button>
            </Card>
          ) : agents.length === 0 ? (
            <EmptyState
              icon={<Bot className="w-10 h-10 text-slate-500" />}
              title="No agents registered"
              description="Register an agent or launch the simulator to generate canonical test agents."
              action={
                isDev ? (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={runSimulatorMutation.isPending}
                    onClick={() => runSimulatorMutation.mutate()}
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    Run Simulator (Dev)
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setCreateAgentOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Register Agent
                  </Button>
                )
              }
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-mono border-b border-white/[0.08]">
                    <tr>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Role / Owner</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">24h Traffic</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {agents.map((agent) => (
                      <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-sky-400" />
                            {agent.name}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            {agent.id}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <Badge variant="neutral">{agent.role || "standard"}</Badge>
                          <span className="text-[11px] text-slate-400 block mt-1">
                            Owner: {agent.owner}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              statusMutation.mutate({
                                agentId: agent.id,
                                status: agent.status === "active" ? "disabled" : "active",
                              })
                            }
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                              agent.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                            }`}
                          >
                            {agent.status === "active" ? "Active" : "Disabled"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <ActivitySparkline agentId={agent.id} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={rotateKeyMutation.isPending}
                            onClick={() => rotateKeyMutation.mutate(agent.id)}
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-1" />
                            Rotate Key
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Tool Registry & Capability Grants */}
        <TabsContent value="tools" className="space-y-6">
          {/* Default Deny Policy Explanation */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <h4 className="font-semibold text-amber-300">
                Capability Grants: Strict Default-Deny Semantics
              </h4>
              <p className="text-amber-200/80 mt-1 leading-relaxed">
                <strong>No grants = no tools.</strong> Every agent begins with zero access. If an agent attempts
                to call an ungranted tool, the Prahari gateway immediately rejects the request with{" "}
                <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">
                  decision: deny (tool_not_granted)
                </code>{" "}
                before evaluation.
              </p>
            </div>
          </div>

          {/* Grid Layout: Agent Selector & Assigned Grants */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Agent Selection */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                Select Agent
              </h3>
              <div className="space-y-1.5">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentForGrants(agent.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between border ${
                      currentGrantAgentId === agent.id
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border-transparent"
                    }`}
                  >
                    <span>{agent.name}</span>
                    <Badge variant="neutral">{agent.role || "generic"}</Badge>
                  </button>
                ))}
              </div>
            </Card>

            {/* Right: Assigned Grants */}
            <Card className="lg:col-span-2 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    Granted Tools for{" "}
                    <span className="text-cyan-400 font-mono">
                      {agents.find((a) => a.id === currentGrantAgentId)?.name || "Agent"}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Authorized MCP tools this agent is permitted to invoke.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCreateToolOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    New Tool
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!currentGrantAgentId || tools.length === 0}
                    onClick={() => setAddGrantOpen(true)}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    Grant Tool
                  </Button>
                </div>
              </div>

              {grantsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : agentGrants.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-white/[0.08] rounded-xl text-xs text-slate-500">
                  No tools currently granted to this agent. All calls will be denied.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05] border border-white/[0.08] rounded-xl overflow-hidden">
                  {agentGrants.map((tool) => (
                    <div
                      key={tool.id}
                      className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                    >
                      <div>
                        <div className="font-mono text-xs font-semibold text-slate-200">
                          {tool.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          Server: {tool.server} &bull; Sensitivity: {tool.sensitivity || "normal"}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        isLoading={revokeGrantMutation.isPending}
                        onClick={() => revokeGrantMutation.mutate(tool.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal: Register Agent */}
      <Dialog open={createAgentOpen} onOpenChange={setCreateAgentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Autonomous Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Agent Name</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g. Finance-Analyst"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Owner / Department</label>
              <input
                type="text"
                value={newAgentOwner}
                onChange={(e) => setNewAgentOwner(e.target.value)}
                placeholder="e.g. FinanceOps"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Role</label>
              <select
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="support">Support</option>
                <option value="finance">Finance</option>
                <option value="devops">DevOps</option>
                <option value="analyst">Analyst</option>
                <option value="security">Security</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateAgentOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newAgentName.trim() || !newAgentOwner.trim()}
              isLoading={createAgentMutation.isPending}
              onClick={() => createAgentMutation.mutate()}
            >
              Register & Generate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Register Tool */}
      <Dialog open={createToolOpen} onOpenChange={setCreateToolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register MCP Tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Tool Identifier</label>
              <input
                type="text"
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value)}
                placeholder="e.g. crm.read_ticket"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">MCP Server / Host</label>
              <input
                type="text"
                value={newToolServer}
                onChange={(e) => setNewToolServer(e.target.value)}
                placeholder="e.g. crm-server"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Data Sensitivity</label>
              <select
                value={newToolSensitivity}
                onChange={(e) => setNewToolSensitivity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="pii">Contains PII</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateToolOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newToolName.trim() || !newToolServer.trim()}
              isLoading={createToolMutation.isPending}
              onClick={() => createToolMutation.mutate()}
            >
              Save Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add Grant */}
      <Dialog open={addGrantOpen} onOpenChange={setAddGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Tool Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <p className="text-slate-400">
              Select an MCP tool to authorize for{" "}
              <strong className="text-slate-200">
                {agents.find((a) => a.id === currentGrantAgentId)?.name}
              </strong>
              .
            </p>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Available Tools</label>
              <select
                value={selectedToolToGrant}
                onChange={(e) => setSelectedToolToGrant(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/[0.1] text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Select a tool --</option>
                {tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.server})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddGrantOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedToolToGrant}
              isLoading={addGrantMutation.isPending}
              onClick={() => addGrantMutation.mutate()}
            >
              Add Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Single-Use API Key Reveal */}
      <Dialog open={!!keyReveal} onOpenChange={(open) => !open && setKeyReveal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              API Key Generated (Shown Once)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-slate-300">
              Copy this API key now for agent{" "}
              <strong className="text-cyan-400">{keyReveal?.name}</strong>. It will{" "}
              <strong>never be shown again</strong> and is stored hashed in the database.
            </p>
            <div className="p-3 bg-slate-950 border border-white/[0.1] rounded-lg font-mono text-xs text-sky-300 break-all select-all flex items-center justify-between gap-2">
              <span>{keyReveal?.key}</span>
              <Button variant="outline" size="sm" onClick={handleCopyKey}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="primary" size="sm" onClick={() => setKeyReveal(null)}>
              I Have Saved the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
