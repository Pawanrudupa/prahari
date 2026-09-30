# 03 — Architecture

## Principle
**Deterministic policy decides. AI advises and explains.** The allow/deny/redact/escalate outcome comes only from the policy engine plus hard limits. ML scores, injection flags and RAG output are inputs (can only make a decision *stricter*) or explanations, never sole authority.

## System diagram
```mermaid
flowchart LR
  A[Agents / SDK / MCP client] -->|tool call| G[Gateway API]
  G --> ID[1 Identity + schema check]
  ID --> INJ[2 Injection scan]
  INJ --> PII[3 PII detect / redact]
  PII --> POL[4 Policy engine - deterministic]
  POL --> LIM[5 Budget + loop limits - Redis]
  LIM --> RISK[6 ML risk score - can only tighten]
  RISK --> DEC{Decision}
  DEC -->|allow / redact| T[Real tool / MCP server]
  DEC -->|escalate| Q[Approval queue]
  DEC -->|deny| X[Blocked]
  DEC --> AUD[(Audit log - hash chain)]
  DEC --> BUS[Event bus] --> WS[WebSocket] --> UI[3D Console]
  RAG[Policy RAG + LLM] -.explain.-> UI
  POL -.clause lookup.-> RAG
```

## Decision pipeline (order matters)
1. Authenticate agent (API key -> agent_id); reject unknown.
2. Validate request against tool JSON schema; reject malformed.
3. Injection scan on inbound tool *outputs/context* attached to the call.
4. PII detect; tag data classes; redact if policy says so.
5. Policy evaluation: explicit deny > escalate > allow > default deny. Record matching rule id + policy version.
6. Budget/loop check (tokens, spend, calls per window, repeated-call signature).
7. Risk score (async for non-blocking; sync only if cheap). Score above threshold upgrades allow -> escalate, never downgrades a deny.
8. Emit decision, append audit record, publish event.
Latency budget: steps 1-6 p95 < 50 ms.

## Components
| Component | Tech | Notes |
|---|---|---|
| Web | Vite, React, TypeScript, react-three-fiber, drei, postprocessing, Zustand, Tailwind, Framer Motion, TanStack Query | 3D + 2D fallback |
| API | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, uvicorn | REST + WebSocket |
| Policy engine | Python evaluator over YAML DSL (MVP); Cedar via cedarpy as P2 | Versioned, hot reload |
| DB | PostgreSQL 16 + pgvector | Single DB for MVP (relational + vectors) |
| Cache/limits | Redis | Counters, loop signatures, pub/sub |
| RAG | pgvector, hybrid (BM25 via Postgres FTS + vectors), local embeddings (bge-small or similar), optional reranker | Provider-neutral LLM client |
| ML | scikit-learn Isolation Forest (risk); heuristics + small classifier (injection) | Models in `services/api/app/ml` |
| Graph (P2) | Neo4j or Postgres recursive queries | Agent-tool-policy graph |
| Simulator | Python, seeded RNG | Emits real gateway calls |
| SDK | Python package with `@guard` decorator + MCP proxy | |
| Infra | Docker Compose; GitHub Actions CI | |

## Repo layout
```
apps/web/src/{scenes,components,stores,api,hooks,styles}
services/api/app/{gateway,policy,pii,injection,risk,rag,audit,approvals,replay,redteam,dpdp,ws,models,schemas,core}
services/api/tests
services/simulator/{agents,attacks}
packages/sdk-python/prahari_sdk
policies/examples   # yaml + sample policy PDFs/markdown for RAG
docs/
docker-compose.yml
```

## Security & Governance Invariants
- **Admin authentication & web session tokens**: Administrative and security auditor endpoints (`/v1/agents`, `/v1/audit/*`, `/v1/tools`) require an admin token or signed session token. `ADMIN_TOKEN` is never exposed to browser client code; the web console logs in via `POST /v1/auth/login` to obtain a signed, short-lived session token (with a clearly marked `/v1/auth/dev-session` for local dev). `/ws/events` and `/v1/graph/snapshot` require authentication.
- **Agent API keys**: Hashed at rest using SHA-256; fast lookup by key prefix + constant-time comparison (`hmac.compare_digest`); unknown or disabled agents receive HTTP 401 and an `agent.auth_failed` audit event is logged.
- **Capability grants enforcement**: `agent_tool_grants` are **enforced** at Step 2b. If an agent has grants defined, calling any tool outside its granted list yields `deny` with reason `tool_not_granted`.
- **Append-only hash chain**: Each record stores `prev_hash` and `hash = SHA256(prev_hash || canonical_json(payload))`. Serialized using PostgreSQL transaction advisory lock (`pg_advisory_xact_lock(740101)`) to guarantee zero chain forks under concurrent gateway requests.
- **Audit checkpoints & truncation window**: Signed HMAC-SHA256 checkpoints `(seq, head_hash)` with `AUDIT_HMAC_KEY` are stored every `AUDIT_CHECKPOINT_INTERVAL` appends. `/v1/audit/verify` validates checkpoint monotonicity, detects missing/deleted checkpoints, and flags tail truncation and whole-chain rewriting. The maximum truncation window is bounded by the checkpoint interval. Outside development, server startup aborts if default placeholder secrets are detected.
- **Event publishing best-effort guarantee**: Event publishing to Redis pub/sub and WebSocket streams occurs strictly after the audit log transaction commits. Event bus failures are caught and logged, and will never fail or alter a gateway tool-call decision.
- **Throughput design & trade-off**: A single global hash chain serializes all appends via advisory locks, capping write throughput to sequential DB transaction latency. This is an intentional MVP governance trade-off for absolute audit integrity before multi-tenant partition/sharding.
- **Redis-down governance behavior**: Configurable via `LIMITS_FAIL_OPEN` (default `false`). When `false`, gateway fails closed (`deny` with `limits_unavailable`) if Redis is down and logs a `limits.unavailable` audit event. When `true`, falls back to in-memory tracking and logs `limits.degraded`.
- **Detector stubs (Phase 1/2)**: Prompt injection scanning and PII detection run server-side heuristic stubs (`app/stubs/`) to validate the pipeline flow. Simulator does not send client-declared injection scores; all PII in simulator is synthetic and fake. Full ML models are introduced in Phase 3 and Phase 5.
- **RAG/LLM output safety**: Escaped in UI (no HTML/script injection). Retrieved policy text is treated as data, not instructions.
- **Fail-closed**: Any unexpected exception in the decision path yields `deny` with reason `engine_error`.
- **Zero raw PII/secrets**: No raw arguments or secrets are stored in audit logs or database fixtures. Only canonical argument hashes (`args_hash`) and detected data-class labels are stored.


## Observability
Structured JSON logs, OpenTelemetry traces on the pipeline steps, `/metrics` (Prometheus format).

