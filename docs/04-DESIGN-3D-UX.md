# 04 — Design: 3D and UX

## Design language: Mission Control
Dark, layered "control room" at night. Calm by default; high-information density without visual noise. Motion signals *governance events*, never frivolous decoration.

### Color Tokens & Semantic Hierarchy
The console ships **dark theme only** (tokens are structured so light theme can be QA'd and enabled later without code changes; the light toggle is suppressed until QA).

| Token | Hex / CSS Value | Semantic Role |
|:---|:---|:---|
| `--bg-base` | `#070A12` | Deep space canvas background |
| `--bg-surface` | `#0B0F19` | Content backdrop / card surfaces |
| `--bg-elevated` | `#101726` | Floating modals, tooltips, dropdowns |
| `--panel` | `rgba(16, 22, 38, 0.72)` + 12px blur | Glass panels with hairline border (`rgba(255,255,255,0.08)`) |
| `--accent-cyan` | `#38BDF8` | Primary brand accent & active selection focus |
| `--allow` | `#2DD4A7` | Permitted tool call (Emerald) |
| `--redact` | `#FBBF24` | PII redacted / modified payload (Amber) |
| `--escalate` | `#A78BFA` | Awaiting human approval pod (Violet) |
| `--deny` | `#F43F5E` | Blocked / policy violation / shattered (Crimson) |
| `--agent` | `#60A5FA` | Agent nodes (Sky Blue) |
| `--tool` | `#94A3B8` | MCP tool nodes (Slate) |
| `--text` | `#E6EAF2` | Primary foreground text (WCAG AAA) |
| `--text-muted` | `#8B95A9` | Secondary captions, timestamps (WCAG AA) |

### Outcome Invariant
**Color is NEVER the sole carrier of status.**
Every decision outcome is accompanied by its standardized Lucide icon:
- **ALLOW**: `CheckCircle2` (`#2DD4A7`)
- **REDACT**: `EyeOff` / `ShieldAlert` (`#FBBF24`)
- **ESCALATE**: `Clock` / `UserCheck` (`#A78BFA`)
- **DENY**: `ShieldX` / `AlertOctagon` (`#F43F5E`)

### Typography
Self-hosted via `@fontsource-variable/*` and `@fontsource/*` packages with `font-display: swap`:
- **Headings / Display**: `Space Grotesk` (`--font-display`)
- **UI / Body**: `Inter` (`--font-sans`)
- **Code / Hashes / IDs**: `JetBrains Mono` (`--font-mono`)

---

## Design System Primitives
All components are built in `apps/web/src/components/ui/` atop Radix UI headless primitives + Tailwind v4 + `clsx`/`tailwind-merge` (`cn()`), utilizing `lucide-react` icons exclusively (no emojis):
1. **Button**: Variants (`primary`, `secondary`, `outline`, `ghost`, `danger`, `accent`), sizes (`sm`, `md`, `lg`), loading spinner state, focus-visible rings.
2. **Badge**: Semantic variants (`allow`, `redact`, `escalate`, `deny`, `neutral`, `agent`, `tool`, `warning`), always featuring icon + label.
3. **Card & Panel**: Glassmorphism containers with 1px hairline border (`border-white/[0.08]`) and subtle backdrop blur.
4. **Tabs**: Accessible Radix Tabs with animated or underlined active pill indicator.
5. **Table**: Crisp tabular data with fixed header, hover states, and monospace formatting for IDs.
6. **Tooltip**: Radix Tooltip with keyboard trigger, accessible description, and instant shortcut hints.
7. **Dialog**: Radix Dialog for modals, confirmation prompts, and API key reveal drawers.
8. **Toast**: Radix Toast for asynchronous escalations, copy notifications, and network status alerts.
9. **Skeleton**: Shimmering placeholder blocks for zero-layout-shift loading states.
10. **EmptyState**: Standardized empty screen with explanatory caption and action button ("Run simulator" CTA in dev).
11. **Kbd**: Monospace keyboard shortcut pill (e.g. `Ctrl + K`, `J / K`, `Esc`).
12. **StatTile**: Compact KPI card displaying numerical metric, trend/delta badge, and sparkline or icon.

---

## Application Route Architecture
Route-level code splitting using `React.lazy` and `Suspense` ensures the landing page never downloads console code:
- `/`: **Public Landing Page** (standalone, zero backend dependency, under 250 KB gzipped initial JS).
- `/login`: **Authentication Portal** (split screen: mission control teaser left, login card right; Dev-session bypass button rendered only when `ENV=development`).
- `/app/*`: **Authenticated Console Shell**:
  - `/app/constellation`: Live 3D constellation & topology graph.
  - `/app/agents`: Agents & tools registry, capability grants editor.
  - `/app/decisions`: Searchable audit decision logs with hash chain verification.
  - `/app/approvals`: Human-in-the-loop escalation queue (Phase 2b-2/UI-2b).
  - `/app/policies`: Policy studio with Monaco YAML editor (lazy-loaded).
  - `/app/sessions`: 3D Workflow session DAG with timeline scrubber.
  - `/app/settings`: Configuration, telemetry readouts, reduced-motion controls.
  - `/app/roadmap`: Clearly labeled upcoming capabilities (RAG explain, Red-team studio, DPDP compliance export).

---

## Public Landing Page Specification
A scroll-driven, high-credibility narrative with zero backend dependencies:
1. **Hero Section**:
   - Headline: *"A Sentinel for AI Agents"*.
   - Subhead: Deterministic, fail-closed governance proxy protecting enterprise tools from untrusted AI agent actions.
   - Primary CTAs: "Launch Console" (`/login` or `/app`), "Watch How It Works" (smooth scrolls to Agent Journey).
   - Ambient background: Live 3D particle constellation running in low-power ambient mode with subtle camera drift.
2. **The Problem Section**:
   - Why traditional API gateways fail: AI agents execute dynamic multi-step plans with tool-calling capabilities; untrusted inputs can prompt-inject the model into invoking ungranted tools, exfiltrating data, or triggering runaway billing loops.
   - Grounded citations: OWASP Top 10 for Agentic Applications ([OWASP GenAI / Agentic Top 10](https://genai.owasp.org/llm-top-10/)).
3. **HERO FEATURE: Interactive 3D "Agent Journey" Workflow Diagram**:
   - An AI agent emits tool-call packets travelling through 8 distinct 3D governance gates in exact pipeline sequence:
     1. `Identity`: Agent authentication & cryptographic API key verification.
     2. `Schema`: Parameter validation against registered MCP tool schema.
     3. `Injection Scan` *(Labeled "Demo Detector")*: Inbound prompt injection inspection.
     4. `PII Detect / Redact` *(Labeled "Demo Detector")*: Synthetic entity redaction (Aadhaar, PAN, email, phone).
     5. `Policy Engine`: Deterministic precedence rules (`deny > escalate > redact > allow > default deny`).
     6. `Rate & Loop Limits`: Sliding window frequency and loop-brake call signature deduplication.
     7. `Risk Score` *(Labeled "Planned / Heuristic")*: Tightening signals.
     8. `Audit Log`: Tamper-evident hash-chained sequence recording.
   - Packet routing by outcome:
     - **Allow**: Emerald particle streaks through all gates directly into target tool.
     - **Redact**: Amber particle pulses through PII gate with redacted payload glow.
     - **Escalate**: Violet particle holds at a central "Human Approval" pod.
     - **Deny**: Crimson particle shatters upon encountering policy/limit violation.
   - Interactive controls:
     - Scroll drives camera focus along the pipeline path with synchronized step captions.
     - Click/hover on any gate reveals a technical drawer card detailing the exact algorithm and documentation reference.
     - "Send an Attack" button fires a real-time prompt injection packet that shatters visibly at Gate 3.
     - "Loop Traffic" toggle streams canned sample packets.
   - Fallbacks:
     - **2D SVG Mode**: Rendered automatically on mobile viewports or when WebGL is unavailable.
     - **Reduced Motion**: Static step cards with animated progress indicators disabled.
4. **How Decisions Are Made**:
   - Mathematical proof of the core invariant: Policy is deterministic; ML/LLM can only tighten or explain, never permit what policy forbids.
   - Visual precedence tree: `deny > escalate > redact > allow > default deny`.
5. **Feature Matrix**:
   - Live Constellation (Active)
   - Hash-Chained Audit & Signed Checkpoints (Active)
   - Capability Grants: No-grants = No-tools (Active)
   - Policy Studio & Monaco Authoring (Active)
   - Approvals Queue (Active)
   - RAG Explanations & Semantic Search (*Planned*)
   - OWASP Red-Team Adversarial Replay (*Planned*)
   - DPDP Evidence Compliance Pack (*Planned with legal disclaimer*)
6. **Architecture & Pre-Alpha Footer**:
   - Gateway pipeline diagram grounded in `docs/03-ARCHITECTURE.md`.
   - Technical stack: FastAPI, PostgreSQL 16 + pgvector, Redis, React 19, Three.js, Vite.
   - Honest "Pre-Alpha" open-source status badge and GitHub repository link.
   - DPDP notice: *"Prahari provides telemetry and technical evidence flagging; this software does not constitute formal legal compliance advice."*

---

## 3D Rendering & Performance Invariants
1. **Canvas Pipeline**:
   - Canvas `dpr={[1, 2]}`, `powerPreference="high-performance"`, ACES Filmic tone mapping, sRGB output.
   - Three.js is initialized after first contentful paint; offscreen canvases are paused via `IntersectionObserver`.
   - Initial JS bundle for landing page strictly $< 250\text{ KB}$ gzipped.
2. **Constellation HD Scene**:
   - High-poly geodesic policy shield with custom fresnel rim glow shader.
   - Crisp SDF text labels (`@react-three/drei` `Billboard` + `Text`) attached to all agent and tool nodes.
   - Curved translucent filaments for capability grants; highlighted with vibrant cyan on hover/selection.
   - High-visibility outcome particle physics:
     - Deny: High-speed red shard burst + shield shockwave ripple.
     - Redact: Amber ring pulse + diamond glyph.
     - Escalate: Violet particle hold with orbiting indicator.
     - Allow: Emerald streak traveling through to target tool.
   - Agent status tint bug fix: Agent badge and glow color reset immediately upon badge clearing or escalation resolution.
3. **Auto-Degrade & Frame Measurement**:
   - Dynamic quality degradation uses a **multi-second rolling median frame time** ($\ge 3$ seconds) to prevent single-frame dips from dropping fidelity.
   - Hidden browser tabs and displays operating at $\le 30\text{ Hz}$ are detected and excluded from degradation triggers.
   - FPS benchmark reports WebGL renderer unmasked string to verify hardware GPU execution (NVIDIA GeForce RTX 3050).

---

## Accessibility & Verification Standards
- **Lighthouse Accessibility Score**: $\ge 90$ on both `/` and `/login`.
- **Axe Core Playwright Checks**: Zero critical or serious accessibility violations.
- **Fallbacks**: Full 2D SVG fallback and `prefers-reduced-motion` compliance across all 3D visualizations.
- **Media Invariant**: Screenshots must be captured at $2\times$ DPR, optimized to PNG, and committed directly to `docs/media/`. Video/animation clips must be under $10\text{ MB}$ and committed to `docs/media/`. No uncommitted assets may be claimed.
