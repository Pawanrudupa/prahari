# 01 — Research Summary

Compiled 29 Sep 2026 from web searches. Claims are paraphrased from the cited sources. Items marked VERIFY were not confirmed and must be checked before being relied on or claimed publicly.

## 1. Problem
Agents now call real tools (APIs, databases, email, payments). Failure modes:
- **Prompt injection via tool output/documents** causes unintended tool calls.
- **Runaway loops / cost blowups** (retries, excessive retrieval).
- **Over-privileged agents** and unclear accountability (who did what, under which policy).
- **Cascading failures** across multi-agent delegation.

OWASP Top 10 for Agentic Applications 2026 (released 9 Dec 2025, IDs ASI01–ASI10) covers: planning, tool use, identity, supply chain, code execution, memory, inter-agent communication, cascading failures, human–agent trust, rogue agents. Use it as the threat taxonomy for red-team mode.
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026
- https://docs.modulos.ai/frameworks/owasp-top-10-agentic

## 2. Landscape (competitors / prior art)
| Project | What it does | Gap we target |
|---|---|---|
| Gravitee AI Gateway | Unified LLM/MCP/A2A proxy; Cedar-subset policy (GAPL) with identity, sensitivity labels, risk score in context; token budgets; circuit breaker preserving session for forensics; gateway replay; drift detection | Enterprise API-management product; no immersive visualization; not RAG-explainable to non-experts |
| Agent Guard (nelsoncc) | Java SDK: budgets, tool authorization, human approval, loop brakes, prompt-injection checks | Java-only, code-level, no UI |
| ScopeBlind protect-mcp | MCP gateway, Cedar via WASM, signed decision receipts | No visual/analyst UX |
| WitnessOS | Evidence-grade receipts, tamper-evident audit chain | Audit-focused only |

Sources:
- https://gravitee.io/runtime-governance.html
- https://gravitee.io/corpus/gen-1152/enterprise-control/policy-enforcement-for-ai-agents.html
- https://github.com/nelsoncc/agent-guard
- https://github.com/agentrust-io/awesome-ai-governance

**Honest positioning:** the firewall concept is not new. Prahari's uniqueness is the *combination*: (a) live 3D observability of agent workflows, (b) RAG-explained, clause-cited decisions, (c) plain-English policy authoring with auto-generated tests, (d) replay/red-team simulator, (e) India DPDP evidence pack. Never claim "first".

## 3. India angle
- DPDP Rules notified Nov 2025 by MeitY; consent must be explicit (no pre-ticked, bundled, or implied consent); notices in English or any of the 22 scheduled languages; phased rollout with most duties applying ~18 months after notification; some provisions due Nov 2026.
- IndiaAI Governance Guidelines (Nov 2025): existing law is extended to AI; DPDP consent, purpose limitation and data minimization apply to AI training and deployment. Application of DPDP to AI systems is still a grey area.
- Product stance: "compliance *evidence* and flagging", never legal advice. Show a disclaimer in UI and reports.
- https://securiti.ai/india-digital-personal-data-protection-act-dpdpa-rules
- https://ssrana.in/articles/effect-of-digital-personal-data-protection-rules-2025-on-ai-regulation/
- https://visionias.in/blog/current-affairs/dpdp-rules-2025-framework-for-personal-data-protection

## 4. Trend evidence (why now)
- NODES AI 2026 sessions: agentic AI governance with real-time policy enforcement; graph-based MCP servers for the context-window problem; GraphRAG that asks clarifying questions. https://neo4j.com/video/nodesai-2026/
- 2026 analyst coverage cites GraphRAG for complex multi-source queries. https://datahubanalytics.com/?p=4667
- Hackathon judging trend: real datasets, strict constraints, measurable metrics (SMART). https://www.hackerearth.com/blog/crafting-hackathon-problem-statements
- SIH 2025 software grand-finale winner solved SIH25159 (real-time AI/ML phishing detection): security/AI-safety themes score well. https://kjsce.somaiya.edu/en/view-announcement/1043

## 5. Frontend tech references
- react-force-graph-3d / 3d-force-graph (Three.js/WebGL): directional particles on links, click-to-expand, DAG mode, custom node geometry, bloom, dynamic data, ~4k element graphs. https://github.com/vasturiano/react-force-graph
- react-three-fiber example with particle flow along edges, glow, bloom, glass-morphism overlays. https://github.com/khawjaahmad/graph-node

## 6. Antigravity notes
- Antigravity reads `GEMINI.md` (highest user priority), `AGENTS.md` (native support since v1.20.3, Mar 2026), then `.agent/rules/`. Workflows: `.agent/workflows/`; skills: `.agent/skills/`. Source is a third-party guide (https://agentpedia.codes/zh/blog/antigravity-agents-md-guide). VERIFY against Antigravity's own docs.

## 7. Open questions / risks
- VERIFY dataset licenses (e.g., deepset/prompt-injections on Hugging Face; AgentDojo benchmark) before training or evaluating.
- 3D performance on low-end laptops: mandatory 2D fallback and instancing.
- LLM in the decision path means non-determinism: forbidden (see AGENTS.md).
- Scope creep: MVP = enforcement + audit + 3D constellation + RAG explain. Everything else is later.
