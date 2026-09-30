# 06 — Roadmap and Acceptance Criteria

Work in vertical slices. Each phase ends demoable with tests green.

## Phase 0 — Foundation (day 1-3)
- Monorepo scaffold, Docker Compose (postgres+pgvector, redis, api, web), CI (lint, tests), `.env.example`.
- DB migrations for agents, tools, policies, sessions, actions, decisions, audit_log.
- **Done when:** `docker compose up` serves API `/health` and web shell; CI passes.

## Phase 1 — Gateway + policy + audit (week 1)
- Gateway endpoint, agent auth, YAML policy engine, default deny, fail-closed.
- Hash-chained audit + `/audit/verify`. Unit tests for precedence and each rule type.
- **Done when:** 20+ policy tests pass; tamper test fails verification; p95 < 50 ms on local benchmark.

## Phase 2 — Simulator + live 3D Constellation (week 2)
- Simulator with 3 agents (Support-Bot, Finance-Agent, DevOps-Agent), benign traffic + 4 attacks.
- WebSocket stream; Constellation scene with particles, shield bursts, drawer.
- 2D fallback view.
- **Done when:** running simulator shows live flow; blocked attacks visibly burst; 60 fps at 200 nodes.

## Phase 3 — PII, budgets, approvals (week 3)
- Indian PII detectors + redaction, budget/loop limits, approval queue UI, circuit breaker.
- **Done when:** DPDP-class data never appears unredacted in outbound tool args when policy requires; loop attack auto-stopped.

## Phase 4 — Policy RAG + explain + authoring (week 4)
- Document ingest/chunking/embeddings, hybrid retrieval, explain endpoint, Policy Studio with English-to-YAML plus generated tests.
- RAG eval set of 30 Q/A pairs with RAGAS or similar; report faithfulness and context precision.
- **Done when:** every decision explanation cites a real clause or states default-deny; eval scores recorded in `docs/eval/`.

## Phase 5 — ML signals + Workflow DAG (week 5)
- Isolation Forest risk score; injection detector (heuristics first, classifier second); session DAG scene with scrubber.
- **Done when:** documented precision/recall on the simulator labeled set; DAG replays a session.

## Phase 6 — Replay, red-team, DPDP report, polish (week 6)
- Replay diff, red-team runner with OWASP mapping, DPDP report export, Incident view fly-in, README with GIF demo, deploy.
- **Done when:** demo script (docs/07) runs end-to-end without manual fixes.

## Definition of Done (every task)
Types/lint clean, tests added, docs updated if behavior/API changed, no secrets committed, decision path remains deterministic.
