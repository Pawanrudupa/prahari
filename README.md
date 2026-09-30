# Prahari (प्रहरी) — Agent Governance Console

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
- **Throughput & Concurrency**: The global advisory lock serializes audit appends sequentially. For MVP, write latency benchmarks achieve p95 = ~13 ms (budget: 50 ms). Multi-tenant sharding is planned for multi-org scale.
- **Limits & Degraded Mode**: Rate limits (calls/min), runaway loop braking (repeated identical call signatures), and daily INR spend caps run in Redis. If Redis is unavailable, Prahari can fail closed (`LIMITS_FAIL_CLOSED=true`) or run in degraded in-memory mode, emitting explicit `limits.degraded` audit events.
- **Detector Stubs**: Phase 1 includes heuristic scanners (`app/stubs/`) for prompt injection and PII to validate pipeline contracts and integration tests. Full ML models (scikit-learn Isolation Forest, BERT injection classifier) and DPDP modules are scheduled for Phases 3 and 5.

