import { useState, useEffect, useCallback, useMemo } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  Scale,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Play,
  Save,
  Zap,
  ShieldCheck,
  History,
  FileCheck,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { Badge } from "../../components/ui/Badge";

// Configure Monaco loader to use the locally bundled monaco-editor, NO CDN
loader.config({ monaco });

interface PolicyVersionItem {
  id: string;
  policy_id: string;
  version: number;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

interface PolicyRuleHitCount {
  rule_id: string;
  count: number;
  last_hit: string | null;
}

const DEFAULT_POLICY_YAML = `policy: production-guard
version: 1
defaults:
  decision: deny
rules:
  - id: R1-allow-read-tickets
    effect: allow
    tool: crm.read_ticket
  - id: R2-redact-pii-outbound
    effect: redact
    tool: email.send
    when:
      data_classes_any:
        - phone
        - email
    redact:
      - phone
  - id: R3-escalate-bulk-export
    effect: escalate
    tool: crm.export
    when:
      rows_gt: 100
  - id: R4-deny-untrusted-instruction
    effect: deny
    tool: infra.drop_db
limits:
  - id: L1
    per: agent
    max_calls_per_min: 60
`;

const PRESET_SCENARIOS = [
  {
    name: "Benign Ticket Read",
    agent_name: "Customer-Support-Bot",
    tool: "crm.read_ticket",
    args: { ticket_id: "T-9921" },
  },
  {
    name: "PII Outbound Send",
    agent_name: "Finance-Payroll-Bot",
    tool: "email.send",
    args: { recipient_ssn: "000-12-3456", customer_phone: "+1-555-0199" },
  },
  {
    name: "Bulk CRM Export (>100 rows)",
    agent_name: "Analytics-Runner",
    tool: "crm.export",
    args: { rows: 500, format: "csv" },
  },
  {
    name: "Dangerous Infra Drop",
    agent_name: "DevOps-Assistant",
    tool: "infra.drop_db",
    args: { target: "prod-database" },
  },
];

export function PolicyStudioPage() {
  const sessionToken = useAuthStore((s) => s.sessionToken);

  const [yamlContent, setYamlContent] = useState<string>(DEFAULT_POLICY_YAML);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const [versions, setVersions] = useState<PolicyVersionItem[]>([]);
  const [ruleHitCounts, setRuleHitCounts] = useState<Record<string, number>>({});
  const [validating, setValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors?: string[];
    rules_count?: number;
  } | null>(null);

  // Workbench test state
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState<number>(0);
  const [customArgs, setCustomArgs] = useState<string>(
    JSON.stringify(PRESET_SCENARIOS[0]?.args ?? {}, null, 2),
  );
  const [testResult, setTestResult] = useState<{
    decision: string;
    rule_id: string | null;
    reason: string;
    latency_ms: number;
  } | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [_loading, setLoading] = useState<boolean>(true);
  const [_selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const authHeaders: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (sessionToken) {
      h.Authorization = `Bearer ${sessionToken}`;
    }
    return h;
  }, [sessionToken]);

  // 1. Fetch active policy and versions
  const loadPolicyData = useCallback(async () => {
    setLoading(true);
    try {
      const pRes = await fetch("/v1/policies", { headers: authHeaders });
      if (pRes.ok) {
        const policies = await pRes.json();
        if (policies.length > 0) {
          const mainPol = policies[0];
          setActivePolicyId(mainPol.id);

          // Fetch versions
          const vRes = await fetch(`/v1/policies/${mainPol.id}/versions`, { headers: authHeaders });
          if (vRes.ok) {
            const vData: PolicyVersionItem[] = await vRes.json();
            setVersions(vData);

            // Fetch active version YAML
            const activeV = vData.find((v) => v.is_active) || vData[0];
            if (activeV) {
              setSelectedVersion(activeV.version);
              const yRes = await fetch(`/v1/policies/${mainPol.id}/versions/${activeV.version}`, {
                headers: authHeaders,
              });
              if (yRes.ok) {
                const yData = await yRes.json();
                setYamlContent(yData.yaml);
              }
            }
          }
        }
      }

      // Fetch rule hit counts
      const hitRes = await fetch("/v1/policies/rule-hit-counts", { headers: authHeaders });
      if (hitRes.ok) {
        const hits: PolicyRuleHitCount[] = await hitRes.json();
        const map: Record<string, number> = {};
        for (const h of hits) {
          map[h.rule_id] = h.count;
        }
        setRuleHitCounts(map);
      }
    } catch {
      // Keep embedded default
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadPolicyData();
  }, [loadPolicyData]);

  // 1b. Load specific version YAML into editor
  const handleLoadVersionYaml = async (versionNumber: number) => {
    if (!activePolicyId) return;
    try {
      const res = await fetch(`/v1/policies/${activePolicyId}/versions/${versionNumber}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setYamlContent(data.yaml);
        setSelectedVersion(versionNumber);
        setStatusMessage({
          type: "success",
          text: `Loaded YAML for version v${versionNumber}.`,
        });
      }
    } catch {
      // ignore
    }
  };

  const activeVersion = versions.find((v) => v.is_active);
  const previousVersion = versions.find((v) =>
    activeVersion ? v.version < activeVersion.version : false,
  );

  // 2. Validate YAML
  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/v1/policies/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ yaml: yamlContent }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch (err: any) {
      setValidationResult({ valid: false, errors: [err.message] });
    } finally {
      setValidating(false);
    }
  };

  // 3. Test workbench evaluation
  const handleTestWorkbench = async () => {
    setTesting(true);
    setTestResult(null);
    const scenario = PRESET_SCENARIOS[selectedScenarioIndex] || PRESET_SCENARIOS[0] || {
      name: "Default",
      agent_name: "Agent",
      tool: "crm.read",
      args: {},
    };
    let parsedArgs = scenario.args;
    try {
      parsedArgs = JSON.parse(customArgs);
    } catch {
      // ignore
    }

    try {
      const res = await fetch("/v1/policies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          yaml: yamlContent,
          sample_input: {
            agent_name: scenario.agent_name,
            tool: scenario.tool,
            args: parsedArgs,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      }
    } catch (err: any) {
      setTestResult({
        decision: "error",
        rule_id: null,
        reason: err.message,
        latency_ms: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  // 4. Save new immutable version
  const handleSaveVersion = async () => {
    if (!activePolicyId) return;
    setStatusMessage(null);
    try {
      const res = await fetch(`/v1/policies/${activePolicyId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          yaml: yamlContent,
          comment: `Version created via Policy Studio at ${new Date().toLocaleTimeString()}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const newV = await res.json();
      setStatusMessage({
        type: "success",
        text: `Version ${newV.version} created! Click 'Activate' to apply atomically.`,
      });
      loadPolicyData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    }
  };

  // 5. Activate version
  const handleActivateVersion = async (vNumber: number) => {
    if (!activePolicyId) return;
    setStatusMessage(null);
    try {
      const res = await fetch(`/v1/policies/${activePolicyId}/versions/${vNumber}/activate`, {
        method: "POST",
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      setStatusMessage({
        type: "success",
        text: `Version ${vNumber} activated atomically! Invariant: All gateway traffic now evaluates against v${vNumber}.`,
      });
      loadPolicyData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    }
  };

  // 6. One-click rollback
  const handleRollback = async () => {
    if (!activePolicyId) return;
    setStatusMessage(null);
    try {
      const res = await fetch(`/v1/policies/${activePolicyId}/rollback`, {
        method: "POST",
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatusMessage({
        type: "success",
        text: `Rolled back successfully to v${data.version}!`,
      });
      loadPolicyData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950 p-6 md:p-8 font-mono text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Scale className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white font-display">
                Policy Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-xs font-semibold">
                YAML Spec v1
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic governance rules with immutable versioning, fail-closed atomic activation, and live rule-hit counters.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={validating}
              data-testid="policy-validate-btn"
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-200 transition cursor-pointer flex items-center gap-1.5"
            >
              <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>{validating ? "Checking..." : "Validate"}</span>
            </button>

            <button
              onClick={handleSaveVersion}
              data-testid="policy-save-version-btn"
              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs text-cyan-200 font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5 text-cyan-400" />
              <span>Save Version</span>
            </button>

            <button
              onClick={handleRollback}
              disabled={!previousVersion}
              data-testid="policy-rollback-btn"
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                previousVersion
                  ? "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-200"
                  : "bg-white/[0.02] border-white/[0.05] text-slate-500 cursor-not-allowed opacity-50"
              }`}
              title={previousVersion ? `Rollback to v${previousVersion.version}` : "No previous version available"}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>{previousVersion ? `Rollback to v${previousVersion.version}` : "Rollback"}</span>
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Validation Result Box */}
        {validationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-4 ${
              validationResult.valid
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {validationResult.valid ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>
                {validationResult.valid
                  ? `Policy syntax & schema valid (${validationResult.rules_count} rules compiled). Ready for activation.`
                  : `Validation Errors: ${validationResult.errors?.join(", ")}`}
              </span>
            </div>
            <button
              onClick={() => setValidationResult(null)}
              className="text-slate-400 hover:text-white px-2 py-0.5"
            >
              Close
            </button>
          </div>
        )}

        {/* Main Grid: Monaco Editor + Version Sidebar & Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Monaco Editor (7 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">YAML Rule Definition</span>
              <span className="text-[11px] text-slate-500">Dark VS Code Engine (Local Bundle)</span>
            </div>

            <div className="h-[480px] rounded-2xl border border-white/10 overflow-hidden bg-[#1e1e1e] shadow-2xl relative">
              <textarea
                data-testid="policy-yaml-textarea"
                aria-label="YAML Rule Definition Source"
                className="sr-only"
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
              />
              <Editor
                height="100%"
                defaultLanguage="yaml"
                theme="vs-dark"
                value={yamlContent}
                onChange={(val) => setYamlContent(val || "")}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineNumbers: "on",
                  fontFamily: "'JetBrains Mono Variable', monospace",
                  tabSize: 2,
                  renderWhitespace: "selection",
                  automaticLayout: true,
                }}
              />
            </div>

            {/* Rule Hit Counter Chips */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.08] space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Live Rule Hit-Count Telemetry</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.keys(ruleHitCounts).length === 0 ? (
                  <span className="text-slate-500 text-[11px]">No rule hits recorded in active window</span>
                ) : (
                  Object.entries(ruleHitCounts).map(([ruleId, count]) => (
                    <span
                      key={ruleId}
                      className="px-2 py-1 rounded-md bg-white/[0.04] border border-white/10 flex items-center gap-1.5"
                    >
                      <span className="font-semibold text-slate-300">{ruleId}:</span>
                      <span className="font-bold text-cyan-300">{count}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Versions Sidebar & Interactive Workbench (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* Version History Sidebar */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <History className="w-4 h-4 text-purple-400" />
                  <span>Version History</span>
                </div>
                <span className="text-[11px] text-slate-500">{versions.length} versions</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1" data-testid="policy-versions-list">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => handleLoadVersionYaml(v.version)}
                    className={`p-2.5 rounded-xl border text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                      v.is_active
                        ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                        : "bg-black/30 border-white/[0.06] text-slate-300 hover:border-white/20"
                    }`}
                    data-testid={`policy-version-row-${v.version}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono">v{v.version}</span>
                        {v.is_active && (
                          <span
                            className="px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300 text-[9px] uppercase font-bold tracking-wider"
                            data-testid={`active-badge-v${v.version}`}
                          >
                            Active
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          by {v.created_by || "admin"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                    </div>

                    {!v.is_active && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivateVersion(v.version);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold transition cursor-pointer"
                        data-testid={`activate-version-${v.version}`}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Dry-Run Workbench */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-4">
              <div className="border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Play className="w-4 h-4 text-emerald-400" />
                  <span>Scenario Dry-Run Workbench</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Simulate evaluation in memory against the editor YAML without saving.
                </p>
              </div>

              {/* Scenario Selector */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Predefined Scenarios</label>
                <select
                  value={selectedScenarioIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedScenarioIndex(idx);
                    setCustomArgs(JSON.stringify(PRESET_SCENARIOS[idx]?.args ?? {}, null, 2));
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white focus:outline-none"
                >
                  {PRESET_SCENARIOS.map((s, idx) => (
                    <option key={s.name} value={idx}>
                      {s.name} ({s.tool})
                    </option>
                  ))}
                </select>
              </div>

              {/* Arguments JSON */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">Invocation Arguments (JSON)</label>
                <textarea
                  rows={3}
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-[11px] text-slate-200 focus:outline-none font-mono"
                />
              </div>

              <button
                onClick={handleTestWorkbench}
                disabled={testing}
                className="w-full py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>{testing ? "Evaluating..." : "Dry-Run Scenario"}</span>
              </button>

              {/* Test Result Display */}
              {testResult && (
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Evaluated Decision:</span>
                    <Badge variant={testResult.decision === "allow" ? "allow" : testResult.decision === "redact" ? "redact" : testResult.decision === "escalate" ? "escalate" : "deny"}>
                      {testResult.decision.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Matching Rule:</span>
                    <span className="text-cyan-300 font-semibold">{testResult.rule_id || "default_deny"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Decision Latency:</span>
                    <span className="text-slate-300">{testResult.latency_ms.toFixed(2)} ms</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
