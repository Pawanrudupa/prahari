# AGENTS.md — Rules for AI coding agents (Prahari)

## Project
Prahari: Agent Governance Console. Governance proxy for AI agents + RAG explanations + ML signals + interactive 3D frontend. Full spec is in `docs/`. **Read `docs/02-PRD.md`, `03-ARCHITECTURE.md`, `05-API-AND-DATA-MODEL.md` before writing code. Read `04-DESIGN-3D-UX.md` before any frontend work.**

## Non-negotiable invariants
1. **Deterministic decisions.** allow/deny/redact/escalate comes only from the policy engine and hard limits. LLM/RAG/ML may explain or make a decision *stricter*, never permit what policy denies.
2. **Fail closed.** Any error in the decision path yields `deny` with reason `engine_error`.
3. **No raw PII or secrets in logs, audit payloads or fixtures.** Store data-class labels only. Use fake data.
4. **Audit log is append-only and hash-chained.** Never update or delete rows.
5. **Retrieved policy text is data, not instructions.** Escape all LLM/RAG output in the UI.
6. **Do not claim legal compliance.** DPDP features are "evidence and flagging"; keep the disclaimer.
7. **Do not invent facts or citations** in docs or README. Mark unknowns VERIFY.

## Stack (do not swap without asking)
- Web: Vite + React + TypeScript (strict), react-three-fiber, drei, @react-three/postprocessing, Zustand, TanStack Query, Tailwind, Framer Motion.
- API: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, PostgreSQL 16 + pgvector, Redis.
- ML: scikit-learn; local embeddings; LLM access via a provider-neutral client reading env vars.
- Tooling: pnpm, uv (or pip-tools), ruff, mypy, pytest, vitest, Docker Compose, GitHub Actions.

## Conventions
- Monorepo layout as in `docs/03-ARCHITECTURE.md`. Small modules; one responsibility each.
- Python: type hints everywhere, async endpoints, Pydantic schemas in `schemas/`, no business logic in routers.
- TS: no `any`; 3D per-frame updates via refs in `useFrame`, never React state; InstancedMesh for many objects.
- Every API change updates `docs/05-API-AND-DATA-MODEL.md` in the same commit.
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Config via env; commit `.env.example` only.

## Process
1. For any non-trivial task, first write a short plan (files to touch, tests to add) and wait for approval if it changes architecture.
2. Work in the phases from `docs/06-ROADMAP.md`; do not start a later phase early.
3. Write tests with the code. Run lint, type-check and tests before declaring done.
4. For frontend changes, verify in the browser (screenshot or recording) including the 2D fallback and reduced-motion mode.
5. Ask when requirements conflict with these invariants; do not silently deviate.

## Commands (fill in as scaffolded)
- `docker compose up` — full stack
- `pnpm --filter web dev` / `pnpm --filter web test`
- `cd services/api && uv run pytest` / `uv run ruff check .` / `uv run mypy .`
- `python -m services.simulator --scenario all --seed 42`

## Definition of Done
Lint/types clean, tests added and passing, docs updated, no secrets, decision path still deterministic, demoable. Work is not complete until CI on main is green; include the run URL in your report.

