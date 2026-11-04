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
- **Milestone 4a (Knowledge Base & Ingestion)**: [COMPLETE] Document ingest/chunking/local embeddings, hybrid retrieval (pgvector + GIN tsvector with RRF), Knowledge Base UI with chunk viewer and live test query inspector.
- **Milestone 4a.1 (Fix Pass)**: [COMPLETE] Strict chunking, ts_rank lexical search, near-domain refusal calibration, evaluate load interference.
- **Milestone 4a.2 (Answerability Gate & Threshold Freeze)**: [COMPLETE] IDF-weighted content-term coverage gate ($c_{min} \ge 0.22$), rare-term ceiling scaling ($s \le 0.40$), three output tiers ("Closest clause", "Weakly related", "No relevant clause"), retrieval threshold freeze.
- **Milestone 4b (Decision Explainability & Grounding Verification)**: [COMPLETE]
  - Offline deterministic explainer decomposing into Why (DB facts), Declared policy basis (authoritative), and Topical suggestions (related, not authoritative).
  - Standing note callout across UI and API: *"Retrieval finds related text; it cannot confirm that the clause states the currency, period, role or value you asked about."*
  - `explanation_snapshots` table with database-level PostgreSQL update prevention trigger.
  - Decision Drawer "Explain Decision" tab with copy buttons, archived source document flagging, and snapshot SHA-256 audit fingerprint.
  - Full Playwright E2E verification test suite (`phase4b-explain.spec.ts`) and media artifacts (`phase4b-explain-grounded-allow.png`, `phase4b-explain-ungrounded-deny.png`, `phase4b-decision-explain-flow.webm`).
- **Milestone 4c (Policy Authoring & English-to-YAML)**: [UPCOMING] Policy Studio with natural language policy drafting and dry-run validation.
- **Done when:** every decision explanation cites a verified clause or states no declared source; eval scores recorded in `docs/eval/`.

## Phase 5 — ML signals + Workflow DAG (week 5)
- Isolation Forest risk score; injection detector (heuristics first, classifier second); session DAG scene with scrubber.
- **Done when:** documented precision/recall on the simulator labeled set; DAG replays a session.

## Phase 6 — Replay, red-team, DPDP report, polish (week 6)
- Replay diff, red-team runner with OWASP mapping, DPDP report export, Incident view fly-in, README with GIF demo, deploy.
- **Done when:** demo script (docs/07) runs end-to-end without manual fixes.

## Definition of Done (every task)
Types/lint clean, tests added, docs updated if behavior/API changed, no secrets committed, decision path remains deterministic.
