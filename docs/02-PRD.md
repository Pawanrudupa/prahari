# 02 — Product Requirements

## Vision
Make AI agent behavior *visible, explainable and controllable*. One console answers: what are my agents doing right now, what was blocked and why, and what would a new policy change?

## Personas
- **Security/Platform engineer (primary):** writes policies, investigates incidents.
- **Compliance officer:** needs DPDP evidence and audit exports; not technical.
- **Agent developer:** integrates SDK, tests agents against policy.
- **Approver:** human who approves/denies escalated actions.
- **Demo judge/evaluator:** must grasp value in 90 seconds via the 3D view.

## Core user stories
1. As an engineer I register an agent and its allowed tools.
2. As an engineer I write a policy (YAML or English) and test it before activating.
3. As an agent developer I wrap my agent's tool calls with the SDK/proxy and see decisions live.
4. As an approver I see escalated actions with context and approve/deny in one tap.
5. As anyone I click a blocked action and get a plain-language, clause-cited explanation.
6. As an engineer I replay past traffic against a draft policy and see the diff.
7. As compliance I export a DPDP evidence report for a date range.
8. As an engineer I run red-team scenarios and see OWASP-mapped coverage.

## Features by priority
**P0 (MVP, demoable)**
- Agent + tool registry; agent identity (API key per agent).
- Gateway endpoint `POST /v1/gateway/tool-call` returning allow | deny | redact | escalate.
- Policy engine (YAML DSL): allow/deny by agent, tool, action, context; budget and loop limits.
- PII detection/redaction (regex + checksum-based for Indian IDs; see 05 doc).
- Hash-chained audit log + verify endpoint.
- Live event stream (WebSocket).
- 3D Agent Constellation (live).
- Policy RAG: ingest policy docs, retrieve clause, explain decision.
- Approval queue.
- Seeded simulator with 3 agents and 4 attack scenarios.

**P1**
- 3D workflow DAG per session with timeline scrubber.
- ML risk score (Isolation Forest on sequence features).
- Prompt-injection detector on tool outputs (heuristics + classifier).
- Replay simulator with diff.
- English-to-policy authoring assistant with generated test cases.
- Circuit breaker + incident view with camera fly-in.

**P2**
- Red-team mode with OWASP ASI mapping and coverage score.
- DPDP report (PDF/HTML export).
- Policy Galaxy view; Neo4j graph queries.
- Cedar (WASM/cedarpy) as alternative policy backend.
- Multi-tenant orgs, RBAC, SSO.

## Non-goals
- Not a general LLM guardrail for chat content moderation.
- Not legal advice or a certified compliance product.
- No training of foundation models.

## Success metrics
- Rule-based decision p95 < 50 ms (excluding async ML/RAG).
- Simulated attack suite: >= 90% blocked/escalated with 0 false blocks on the benign baseline set.
- 100% of decisions carry a policy clause reference or "default deny" reason.
- Audit chain verification passes; tampering test fails verification as expected.
- 3D view holds 60 fps at 200 agents/tools nodes on a mid-range laptop; 30 fps floor.
