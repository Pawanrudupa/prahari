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
