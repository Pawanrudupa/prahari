# GEMINI.md — Antigravity-specific overrides (Prahari)
Follow `AGENTS.md` as the base rules; this file only adds Antigravity behavior.

- Start each task by producing an **Implementation Plan artifact**; keep it scoped to the current roadmap phase.
- Use the **browser agent** to verify frontend work: load the app, exercise the 3D scene, capture a screenshot, and check the console for errors. Also check the 2D fallback.
- Prefer small, reviewable changes per task; one feature slice per conversation to save quota.
- Use `docs/` as the source of truth instead of re-reading the whole codebase; update `docs/` when decisions change.
- When a needed library or API detail is uncertain, look up current docs and note the source rather than guessing.
- Never run destructive commands (drop DB, rm -rf, force push) without explicit confirmation.
