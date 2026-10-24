# Prahari (प्रहरी) — Agent Governance Console

[![CI](https://github.com/Pawanrudupa/prahari/actions/workflows/ci.yml/badge.svg)](https://github.com/Pawanrudupa/prahari/actions/workflows/ci.yml)

> A sentinel for AI agents. Every tool call an agent makes is identified, checked against policy, risk-scored, and either allowed, redacted, blocked, or escalated to a human — and you can *watch it happen* in a live 3D control room.

**Status:** pre-alpha, greenfield. Start with `KICKOFF_PROMPT.md`.


## What it is
A governance proxy that sits between AI agents and their tools (MCP servers, HTTP APIs). It combines:
- a **deterministic policy engine** (the only thing that can allow/deny),
- **RAG over policy documents** (explains every decision, cites the clause),
- **ML risk scoring + prompt-injection detection** (advisory signals),
- a **hash-chained audit log**, replay simulator, and red-team mode,
- an **interactive 3D frontend** (agent constellation, workflow DAG, policy galaxy),
- an **India DPDP compliance evidence pack**.

## Repo layout (target)
```
apps/web            React + TS + react-three-fiber frontend
services/api        FastAPI gateway + policy engine + RAG + ML
services/simulator  Synthetic agents and attack scenarios (seeded)
packages/sdk-python  @guard decorator / MCP proxy client
policies/examples   Sample YAML policies + policy PDFs for RAG
docs/               Spec (read these first)
.agent/             Antigravity rules and workflows
```

## Read order
1. `AGENTS.md` (rules)  2. `docs/02-PRD.md`  3. `docs/03-ARCHITECTURE.md`  4. `docs/04-DESIGN-3D-UX.md`  5. `docs/05-API-AND-DATA-MODEL.md`  6. `docs/06-ROADMAP.md`  7. `docs/01-RESEARCH.md` (background)

## Quick start

```bash
# Clone
git clone https://github.com/Pawanrudupa/prahari.git
cd prahari

# Copy env
cp .env.example .env

# Start everything
docker compose up --build

# API: http://localhost:8000/health
# Web: http://localhost:5173
```

## Local dev (without Docker)

```bash
# API
cd services/api
uv sync --dev
uv run alembic upgrade head
uv run uvicorn app.main:create_app --factory --reload

# Web (in another terminal, from repo root)
pnpm install
pnpm --filter @prahari/web dev
```

## Phase 1 Architecture & Security Notes

- **Deterministic Governance**: Tool-call decisions are strictly deterministic: `deny > escalate > redact > allow > default deny`. AI signals can only make decisions stricter or explain them.
- **Admin Authentication**: All sensitive admin endpoints (`POST /v1/agents`, `GET /v1/audit/verify`, `POST /v1/audit/checkpoint`) require a bearer token matching `ADMIN_TOKEN`.
- **Cryptographic Audit Chain**:
  - Every decision appends to a serialized SHA-256 hash chain (`hash = SHA256(prev_hash || canonical_json(payload))`).
  - Serialized via PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) ensuring 0 forks under concurrent requests.
  - Periodic HMAC-SHA256 signed checkpoints (`POST /v1/audit/checkpoint`) protect against database tail truncation and whole-chain rewriting attacks.
  - Zero raw PII/secrets stored: only argument hashes (`args_hash`) and detected data-class labels are retained.
- **Throughput & Concurrency Latency Profile**:
  - **Uncontended Sequential Execution**: Measured $p50 \approx 24.1\text{ ms}$, $p95 \approx 30.5\text{--}34.6\text{ ms}$ (comfortably within the $50\text{ ms}$ target budget). Full accounting of the sequential $p50 \approx 24\text{ ms}$:
    - Step 1 (Token Authentication & SHA-256 Digest Comparison): $\sim 3.1\text{ ms}$
    - Step 2b (Capability Grants Database Check): $\sim 1.7\text{ ms}$
    - Steps 3–5 (Heuristic Stubs, In-Memory Policy Evaluation, Redis Rate Limits): $\sim 1.5\text{ ms}$
    - Step 8b (Relational Session/Action/Decision Mapping & Sequence Query): $\sim 4.0\text{ ms}$
    - Step 9 (Best-Effort Async Event Emission to Redis Pub/Sub): $\sim 1.3\text{ ms}$
    - Step 6/8 (Atomic Audit Append & Transaction Commit): $\sim 12.1\text{ ms}$ (`lock_wait` $\sim 1.4\text{ ms}$, `query_prev` $\sim 1.7\text{ ms}$, in-app SHA-256 $\sim 0.05\text{ ms}$, `insert` $\sim 0.04\text{ ms}$, single atomic `commit` $\sim 8.0\text{ ms}$)
    - Total: $\sim 3.1 + 1.7 + 1.5 + 4.0 + 1.3 + 12.1 \approx 23.7\text{ ms} \approx 24\text{ ms}$.
  - **20-Way Concurrent Execution**: Measured $p50 \approx 361\text{ ms}$, $p95 \approx 1.23\text{ s}$ ($\sim 41.9\text{ ops/sec}$ throughput). This elevated latency under concurrent contention is intentional: the PostgreSQL transactional advisory lock (`pg_advisory_xact_lock(740101)`) queues transactions sequentially to guarantee zero forks and strict monotonic linear ordering across all workers. Single-chain throughput is capped at $\sim 40\text{--}42\text{ ops/sec}$ per instance with full WAL durability. Multi-tenant sharded partition chains are planned for multi-org horizontal scaling.
- **Limits & Degraded Mode**: Rate limits (calls/min), runaway loop braking (repeated identical call signatures), and daily INR spend caps run in Redis. If Redis is unavailable, Prahari can fail closed (`LIMITS_FAIL_CLOSED=true`) or run in degraded in-memory mode, emitting explicit `limits.degraded` audit events.
- **Detector Stubs**: Phase 1 includes heuristic scanners (`app/stubs/`) for prompt injection and PII to validate pipeline contracts and integration tests. Full ML models (scikit-learn Isolation Forest, BERT injection classifier) and DPDP modules are scheduled for Phases 3 and 5.

