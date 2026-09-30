# 05 — API and Data Model

## Tables (PostgreSQL)
- `agents(id, name, owner, role, api_key_prefix, api_key_hash, status, created_at)`
- `tools(id, name, server, schema_json, sensitivity, created_at)`
- `agent_tool_grants(agent_id, tool_id)`
- `policies(id, name, status, active_version_id)`
- `policy_versions(id, policy_id, version, yaml, created_by, created_at)`
- `policy_documents(id, title, source, uploaded_at)`
- `policy_chunks(id, document_id, text, embedding vector, meta jsonb)`
- `sessions(id, agent_id, goal, started_at, ended_at)`
- `actions(id, session_id, seq, tool_id, args_json, purpose, data_classes text[], parent_action_id, created_at)`  # parent gives the workflow DAG
- `decisions(id, action_id, outcome, rule_id, policy_version_id, reason, risk_score, injection_score, latency_ms, created_at)`
- `approvals(id, decision_id, status, approver, decided_at, note)`
- `incidents(id, session_id, kind, severity, opened_at, closed_at)`
- `audit_log(id, seq, prev_hash, hash, payload_json, created_at)`
- `budgets(agent_id, window, max_tokens, max_spend, max_calls)`
- `redteam_runs(id, scenario, owasp_ids text[], result, created_at)`

## Policy DSL (YAML, MVP)
```yaml
policy: customer-data-guard
version: 1
defaults: { decision: deny }
rules:
  - id: R1-allow-read-tickets
    effect: allow
    agent: { role: support }
    tool: crm.read_ticket
  - id: R2-redact-pii-outbound
    effect: redact
    tool: email.send
    when: { data_classes_any: [aadhaar, pan, phone, email] }
    redact: [aadhaar, pan]
  - id: R3-escalate-bulk-export
    effect: escalate
    tool: crm.export
    when: { rows_gt: 100 }
  - id: R4-deny-untrusted-instruction
    effect: deny
    when: { injection_score_gte: 0.8 }
limits:
  - { id: L1, per: agent, max_calls_per_min: 60, max_repeat_same_call: 5, max_spend_inr_per_day: 500 }
```
Evaluation precedence: deny > escalate > redact > allow > default. Every decision returns `rule_id` and `policy_version`.

## REST endpoints (v1)
- `POST /v1/gateway/tool-call` body `{agent_key, session_id, tool, args, purpose?, context?{tool_outputs[]}}` -> `{decision, rule_id, reason, redacted_args?, approval_id?, decision_id}`
- `GET/POST /v1/agents`, `GET/POST /v1/tools`, `POST /v1/agents/{id}/grants`
- `GET/POST /v1/policies`, `POST /v1/policies/{id}/versions`, `POST /v1/policies/{id}/activate`, `POST /v1/policies/{id}/test`
- `POST /v1/policies/author` body `{instruction}` -> draft YAML + generated test cases
- `POST /v1/documents` (upload policy doc), `GET /v1/documents`
- `GET /v1/decisions/{id}/explain` -> `{summary, clauses:[{doc,chunk,score}], rule_id}`
- `GET /v1/sessions/{id}/graph` -> DAG nodes/edges for the 3D workflow view
- `GET /v1/approvals?status=pending`, `POST /v1/approvals/{id}/decide`
- `POST /v1/replay` body `{policy_version_id|yaml, from, to}` -> diff of outcomes
- `POST /v1/redteam/run` body `{scenarios[]}`, `GET /v1/redteam/coverage`
- `GET /v1/audit/verify`, `GET /v1/reports/dpdp?from=&to=`
- `POST /v1/incidents/{id}/circuit-break`

## WebSocket `/ws/events`
Event envelope: `{type, ts, payload}`. Types: `action.decided`, `approval.pending`, `incident.opened`, `agent.status`, `policy.activated`, `budget.warning`.
`action.decided` payload: `{decision_id, agent_id, tool_id, outcome, rule_id, risk_score, session_id, parent_action_id}`.

## PII detectors (India-focused)
Aadhaar (12 digits, Verhoeff checksum), PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), Indian mobile (`(\+91)?[6-9]\d{9}`), email, IFSC, UPI ID. Detectors must return data class labels only, never store raw values in logs.

## DPDP evidence report contents
Per agent and period: actions touching personal data, declared purpose (or "missing"), redactions applied, escalations and approver, retention flags, audit-chain verification result. Footer disclaimer: not legal advice.
