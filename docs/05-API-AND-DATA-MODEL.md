# 05 — API and Data Model

## Tables (PostgreSQL)
- `agents(id, name, owner, role, api_key_prefix, api_key_hash, status, tags text[], created_at)`
- `tools(id, name, server, schema_json, sensitivity, tags text[], created_at)`
- `agent_tool_grants(agent_id, tool_id)`
- `policies(id, name, status, active_version_id)`
- `policy_versions(id, policy_id, version, yaml, created_by, created_at)`
- `policy_documents(id, title, source, uploaded_at)`
- `policy_chunks(id, document_id, text, embedding vector, meta jsonb)`
- `sessions(id, agent_id, goal, started_at, ended_at)`
- `actions(id, session_id, seq, tool_id, args_json, purpose, data_classes text[], parent_action_id, created_at)`  # parent gives the workflow DAG
- `decisions(id, action_id, outcome, rule_id, policy_version_id, reason, risk_score, injection_score, latency_ms, created_at)`
- `approvals(id, decision_id, status, approver, decided_at, note, approval_token, approval_token_expires_at, consumed_at)`
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
- `POST /v1/gateway/tool-call` body `{agent_key, session_id, tool, args, purpose?, context?{user_prompt, tool_outputs[]}, parent_action_id?, approval_token?}` (or `X-Approval-Token` header) -> `{decision, rule_id, reason, redacted_args?, approval_id?, decision_id, data_classes}` (validates single-use approval token bound to args hash & agent)
- `GET/POST /v1/agents` (admin only; returns HTTP 409 Conflict if name already exists; supports `tags`; writes audit event on creation)
- `PATCH /v1/agents/{id}` body `{status: "active"|"disabled"}` (admin only) -> `{id, name, owner, role, status, created_at}` (enables or disables an agent; writes `agent.status_updated` audit event)
- `POST /v1/agents/{id}/rotate-key` (admin only) -> `{id, name, api_key}` (rotates agent credentials idempotently; writes `agent.key_rotated` audit event)
- `GET /v1/agents/{id}/activity?window=1h|24h|7d` (admin/session) -> `{agent_id, window, points: [{timestamp, count, allow, redact, escalate, deny}]}` (timeseries activity sparkline)
- `GET /v1/tools` (admin/session; supports `tags`), `POST /v1/tools` (admin only; writes `tool.created` audit event)
- `POST /v1/agents/{id}/grants` (admin only; writes `agent.grant_added` audit event), `DELETE /v1/agents/{id}/grants/{tool_id}` (admin only; writes `agent.grant_revoked` audit event), `GET /v1/agents/{id}/grants` (admin/session)
- `GET /v1/decisions?cursor=&limit=&outcome=&agent=&tool=&rule_id=&from_time=&to_time=` (admin/session) -> `{items, next_cursor, has_more, total_count}` (cursor-paginated, multi-filter searchable decisions from hash-chained audit log)
- `GET /v1/graph/snapshot` -> `{latest_audit_seq, agents, tools, grants, recent_decisions}` (for 3D constellation initial load & subscribe-then-snapshot deduplication; excludes stress nodes by default)
- `GET/POST /v1/policies`, `POST /v1/policies/validate` (dry-run YAML syntax/schema check), `POST /v1/policies/test` (sample inputs against policy rules), `POST /v1/policies/{id}/versions`, `POST /v1/policies/{id}/activate`, `POST /v1/policies/{id}/rollback` (one-click rollback to prior version; audited)
- `POST /v1/policies/author` body `{instruction}` -> draft YAML + generated test cases
- `POST /v1/documents` (upload policy doc), `GET /v1/documents`
- `GET /v1/decisions/{id}/explain` -> `{summary, clauses:[{doc,chunk,score}], rule_id}`
- `GET /v1/sessions` (list sessions with goal, agent, timestamps, action counts) and `GET /v1/sessions/{id}/graph` -> DAG nodes/edges with causal parent-child actions for the 3D workflow view
- `GET /v1/approvals?status=pending|approved|denied|expired` (approver/admin), `GET /v1/approvals/{id}` (approver/admin), `POST /v1/approvals/{id}/decide` body `{decision: "approve"|"deny", note?: string}` -> `{id, decision_id, status, approver, decided_at, note, approval_token, approval_token_expires_at}` (mints single-use 5-min token; audited)
- `GET /v1/gateway/approvals/{id}` (agent polling endpoint; returns `{id, status, approval_token}`)
- `POST /v1/replay` body `{policy_version_id|yaml, from, to}` -> diff of outcomes
- `POST /v1/redteam/run` body `{scenarios[]}`, `GET /v1/redteam/coverage`
- `GET /v1/audit/verify` (admin only), `POST /v1/audit/checkpoint` (admin only)
- `GET /v1/reports/dpdp?from=&to=`
- `POST /v1/incidents/{id}/circuit-break`
- `POST /v1/dev/archive-stress` (admin/dev only; sets `status='archived'` on stress-tagged agents/tools; zero audit deletion)
- `POST /v1/dev/simulate` body `{scenario: string, count: int, seed: int, stress?: bool}` -> `{scenario, count, seed, summary: {allow, redact, escalate, deny}, decisions}` (development and test environments only; returns HTTP 404 in production; concurrency guarded via Redis distributed lock with 120s TTL auto-expiry returning HTTP 409 Conflict if already running)

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

## Admin Events & Diagnostics Endpoints (UI-2b.1)
- `GET /v1/decisions/admin-events`: Cursor-paginated admin actions (`actor`, `operation`, `target_id`, `details`, `seq`, `created_at`). Excluded from the agent tool decision stream.
- `GET /v1/audit/verify`: Cryptographic verification returning:
  ```json
  {
    "valid": true,
    "records_verified": 164,
    "total_records": 164,
    "head_seq": 164,
    "head_hash": "f6a4f97d061aec58...",
    "checkpoints_verified": 3,
    "broken_seq": null,
    "error": null
  }
  ```
- `POST /v1/dev/tamper-audit`: Dev-only admin endpoint to simulate tampered database rows (`tamper_type: "hash" | "payload" | "restore"`).

## Gateway Latency Budget & Stage Breakdown
Gateway benchmark target: $p95 < 50\text{ ms}$.
Measured stage-level profile breakdown (local execution):
- **Stage 1 (Token Authentication & Capability Grant Check)**: ~0.4 ms
- **Stage 2 (Heuristic Injection Detection)**: ~0.1 ms
- **Stage 3 (India PII Scanning & Redaction Detection)**: ~0.3 ms
- **Stage 4 (Deterministic Policy Engine Evaluation)**: ~0.4 ms
- **Stage 5 (Hard Rate & Token Limit Checking)**: ~0.6 ms
- **Stage 6 (PostgreSQL Insert, Transactional Advisory Lock & Chained Audit Hash)**: ~28.0–32.0 ms
- **Measured Gateway Total**: $p50 \approx 28.5\text{ ms}$, $p95 \approx 33.74\text{ ms}$ (comfortably within the 50 ms budget).

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

