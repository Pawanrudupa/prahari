# Kickoff prompt (paste into Antigravity, Planning mode, after opening this repo)

You are building **Prahari — Agent Governance Console**, a governance proxy for AI agents with RAG-explained decisions, ML risk signals, and an interactive 3D frontend.

First read `AGENTS.md`, `GEMINI.md`, and everything in `docs/` (start with 02-PRD, 03-ARCHITECTURE, 05-API-AND-DATA-MODEL, then 04-DESIGN-3D-UX and 06-ROADMAP). The docs are the source of truth. Key invariant: **policy decisions are deterministic; AI only explains or tightens.**

Task: run `.agent/workflows/kickoff.md`.
1. Reply with a 10-bullet summary of your understanding plus any ambiguities/risks you see (including anything marked VERIFY in docs/01-RESEARCH.md).
2. Produce an Implementation Plan artifact for **Phase 0 only** (monorepo scaffold, Docker Compose with Postgres+pgvector and Redis, FastAPI `/health`, Vite+React+TS+react-three-fiber shell showing an empty 3D scene, migrations for core tables, CI, `.env.example`).
3. Wait for my approval before writing code.
4. After approval: implement Phase 0, run lint/types/tests, verify the web shell in the browser, and report what to do next (Phase 1: gateway + policy engine + hash-chained audit).

Do not start later phases. Do not change the stack without asking.
