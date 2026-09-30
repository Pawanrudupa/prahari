# 04 — Design: 3D and UX

## Design language
Control-room at night. Dark space background, restrained neon, glass panels. Calm by default; motion signals *events*, not decoration.

### Tokens
| Token | Value | Use |
|---|---|---|
| --bg | #070A12 | scene/background |
| --panel | rgba(16,22,38,0.65) + 12px blur | glass panels |
| --allow | #2DD4A7 | allowed |
| --redact | #FBBF24 | redacted |
| --escalate | #A78BFA | awaiting human |
| --deny | #F43F5E | blocked |
| --agent | #60A5FA | agent nodes |
| --tool | #94A3B8 | tool nodes |
| --text | #E6EAF2 / muted #8B95A9 | text |
Fonts: Inter (UI), JetBrains Mono (code/IDs), one display face for headings (e.g., Space Grotesk). Light theme supported via tokens.

## Global layout
- Left rail: icon nav (Constellation, Sessions, Policies, Approvals, Incidents, Replay, Red-team, Reports, Settings).
- Top bar: environment badge, live-connection dot, Ctrl+K command palette, search, theme toggle.
- Right drawer (contextual): details for selected node/decision, with **Explain** tab (RAG), **Raw** tab, **Audit** tab.
- Bottom timeline (in Constellation and Workflow): scrubber, play/pause, speed, live/paused.

## Screens and 3D scenes
1. **Live Constellation (home)**: agents = glowing spheres (size = activity, halo = risk), tools = outer ring of cubes/octahedra, grouped by server. Actions = particles travelling along edges. Blocked particles hit a translucent "policy shield" shell and burst red; escalated ones pause and pulse violet. Camera: orbit, click-to-focus with eased fly-to, double-click to reset. Hover = tooltip; click = drawer.
2. **Workflow DAG (session)**: layered 3D DAG (goal -> steps -> tool calls, z = time). Node color = outcome. Scrubber replays the session; clicking a node opens its decision. Branches from delegation between agents shown as bridging edges.
3. **Policy Galaxy (P2)**: policies = star clusters, rules = stars, brightness = hit frequency; click star -> matching actions list and clause text.
4. **Incident view**: on circuit-break, camera flies to the offending agent, others dim, evidence trail highlights in order, side panel shows timeline + explanation + "Resume / Keep isolated".
5. **Approvals**: card stack (swipe or J/K keys), each card shows action, args (PII masked), risk, rule, agent history; Approve / Deny / Ask-why.
6. **Policy Studio**: split view: YAML editor (Monaco) left, English-authoring chat + generated tests right, "Replay against last 24h" button with diff table.
7. **Replay**: outcome diff as a 3D before/after ghost overlay plus tabular changes.
8. **Red-team**: scenario cards mapped to OWASP ASI ids, run button, coverage radar chart.
9. **Reports**: DPDP evidence preview and export.

## Interaction details
- All 3D objects have keyboard-accessible equivalents in the drawer lists.
- Selection sync: selecting in any list highlights in 3D and vice versa.
- Event throttling: batch WS events per animation frame; cap particles (pool of 500).
- Camera presets: Overview, Follow agent, Top-down.
- Toasts for escalations; sound off by default.

## Performance rules
- Use InstancedMesh for nodes, a pooled particle system, no per-frame React state updates (mutate refs in `useFrame`).
- Bloom only on emissive layer; disable postprocessing on low-power mode.
- Target 60 fps at 200 nodes / 500 live particles; auto-degrade quality below 40 fps.
- Lazy-load 3D bundle; skeleton UI first.

## Accessibility and fallback
- `prefers-reduced-motion`: no particle bursts, static highlights.
- Full **2D mode** (table + force graph) selectable and auto-selected without WebGL or on small/mobile screens.
- Color is never the only signal: outcomes also use icons/shapes (check, shield-half, hand, x).
- WCAG AA contrast on text.

## Empty/loading/error states
Every screen defines: empty (with "Run simulator" CTA), loading skeleton, disconnected banner with auto-retry, error with request id.
