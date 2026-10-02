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
- `audit_checkpoints(id, seq, head_hash, signature, created_at)`
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

## Capability Grants & Enforcement
- `agent_tool_grants(agent_id, tool_id)`: **ENFORCED** at gateway Step 2b. Strict default-deny semantics: **"No grants = no tools"**. Every agent starts with zero tool access. If an agent attempts to call any tool not explicitly granted via `agent_tool_grants`, the gateway immediately rejects it with `decision: deny` and `reason: tool_not_granted`.

## REST endpoints (v1)
- `POST /v1/auth/login` body `{admin_token}` -> `{session_token, token_type, expires_in, mode}` (exchanges admin secret for browser session token; admin secret is never exposed in browser)
- `GET /v1/auth/dev-session` -> `{session_token, mode: "development-bypass"}` (development-only bypass, rejected in production with HTTP 404)
- `POST /v1/auth/ws-ticket` (admin or session auth) -> `{ticket, expires_in}` (mints a single-use, 30-second ticket for WebSocket connection; prevents token exposure in URLs and access logs)
- `POST /v1/gateway/tool-call` body `{agent_key, session_id, tool, args, purpose?, context?{user_prompt, tool_outputs[]}}` -> `{decision, rule_id, reason, redacted_args?, approval_id?, decision_id, data_classes}`
- `GET/POST /v1/agents` (admin only)
- `GET /v1/tools` (admin/session), `POST /v1/tools` (admin only)
- `POST /v1/agents/{id}/grants` (admin only), `GET /v1/agents/{id}/grants` (admin/session)
- `GET /v1/graph/snapshot` -> `{latest_audit_seq, agents, tools, grants, recent_decisions}` (for 3D constellation initial load & subscribe-then-snapshot deduplication)
- `GET/POST /v1/policies`, `POST /v1/policies/{id}/versions`, `POST /v1/policies/{id}/activate`, `POST /v1/policies/{id}/test`
- `POST /v1/policies/author` body `{instruction}` -> draft YAML + generated test cases
- `POST /v1/documents` (upload policy doc), `GET /v1/documents`
- `GET /v1/decisions/{id}/explain` -> `{summary, clauses:[{doc,chunk,score}], rule_id}`
- `GET /v1/sessions/{id}/graph` -> DAG nodes/edges for the 3D workflow view
- `GET /v1/approvals?status=pending`, `POST /v1/approvals/{id}/decide`
- `POST /v1/replay` body `{policy_version_id|yaml, from, to}` -> diff of outcomes
- `POST /v1/redteam/run` body `{scenarios[]}`, `GET /v1/redteam/coverage`
- `GET /v1/audit/verify` (admin only), `POST /v1/audit/checkpoint` (admin only)
- `GET /v1/reports/dpdp?from=&to=`
- `POST /v1/incidents/{id}/circuit-break`

## WebSocket `/ws/events`
Authentication: Requires single-use ticket query param `?ticket=<ws_ticket>` (obtained from `POST /v1/auth/ws-ticket`, TTL 30s). `?token=` query parameters are strictly forbidden and rejected to prevent credentials from being logged in reverse proxy access logs, URLs, or browser history.
Client queue: Bounded per-client buffer (`maxsize=1000`). If client lags and the queue fills up, oldest events are dropped to prevent memory leaks, and a synthetic `stream.resync` event is pushed:
```json
{
  "event_id": "uuid",
  "timestamp": "iso-time",
  "type": "stream.resync",
  "payload": {
    "reason": "queue_overflow",
    "message": "Client queue overflowed; events dropped. Fetch /v1/graph/snapshot to reconcile."
  }
}
```
Client handles `stream.resync` by fetching `GET /v1/graph/snapshot` to reconcile missing nodes/edges.
Heartbeats: Periodic server ping/heartbeat every 25s; client ping responded with pong.
Event envelope: `{event_id, timestamp, type, payload}`.
Types: `action.decided`, `approval.pending`, `incident.opened`, `agent.status`, `policy.activated`, `budget.warning`, `stream.resync`.

`action.decided` payload schema:
```json
{
  "decision_id": "uuid",
  "action_id": "uuid",
  "agent_id": "uuid",
  "agent_name": "Support-Bot",
  "tool_id": "crm.read_ticket",
  "outcome": "allow",
  "rule_id": "R1-allow-read-tickets",
  "risk_score": 0.0,
  "session_id": "uuid",
  "parent_action_id": null,
  "audit_seq": 105,
  "data_classes": [],
  "latency_ms": 12.3
}
```

## Known Limits & Architectural Constraints
1. **Checkpoint Truncation Detection Window**:
   - Checkpoints store `(seq, head_hash, signature)` using HMAC-SHA256 (`AUDIT_HMAC_KEY`).
   - Auto-checkpointed every `AUDIT_CHECKPOINT_INTERVAL` appends (default 50).
    - Deleting records appended after the most recent checkpoint `(k * N)` up to `(k * N) + m` can theoretically occur before the next checkpoint is persisted. `AUDIT_CHECKPOINT_INTERVAL` bounds this exposure; `/v1/audit/verify` flags if uncheckpointed rows exceed the interval or if checkpoint sequence monotonicity is broken.
2. **Single-Chain Advisory Lock Sequencer**:
   - Audit log append sequencing uses a PostgreSQL transactional advisory lock (`pg_advisory_xact_lock(740101)`).
   - Guarantees strict monotonic linear sequence numbers with zero forks under concurrent load.
   - Tradeoff: Inherently serializes audit commits, limiting maximum write throughput to ~1,000–3,000 appends/sec per PostgreSQL database instance. Multi-region horizontal scale would require sharded partition chains.
3. **Production Startup Secret Guard**:
   - Server refuses startup if default placeholder secrets (`ADMIN_TOKEN`, `AUDIT_HMAC_KEY`, `SESSION_SECRET_KEY`) are detected outside `ENV=development`.
4. **Database Connection Pool Sizing Constraint**:
   - Sized conservatively (`DB_POOL_SIZE=10`, `DB_MAX_OVERFLOW=5`) to prevent PostgreSQL connection exhaustion.
   - Operational invariant: `workers * (DB_POOL_SIZE + DB_MAX_OVERFLOW) < max_connections` (default 100).
   - Lifespan logs a startup warning if configured pool total per process exceeds 30.
5. **Dedicated Benchmark Database & Truncation Guard**:
   - Latency benchmarks must run on isolated databases (`*test*` or `*bench*`, e.g. `prahari_bench`).
   - Truncation is unconditionally refused against primary databases unless `ALLOW_BENCH_TRUNCATE=true` is explicitly provided.

## PII detectors (India-focused)
Aadhaar (12 digits, Verhoeff checksum), PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), Indian mobile (`(\+91)?[6-9]\d{9}`), email, IFSC, UPI ID. Detectors must return data class labels only, never store raw values in logs.

## DPDP evidence report contents
Per agent and period: actions touching personal data, declared purpose (or "missing"), redactions applied, escalations and approver, retention flags, audit-chain verification result. Footer disclaimer: not legal advice.

