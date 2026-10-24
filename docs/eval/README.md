# Prahari Policy RAG Evaluation Suite

Deterministic benchmark evaluation for Policy RAG hybrid semantic retrieval (Milestone 4a.1 Frozen).

## Overview
- **Retrieval Architecture**: FastEmbed `BAAI/bge-small-en-v1.5` (384-dimensional dense vectors via ONNX Runtime) combined with PostgreSQL TSVector Full-Text Search (OR-semantics tsquery with stopword filtering) using Reciprocal Rank Fusion (standard unweighted $k=60$).
- **Calibrated Thresholds**: Dense cosine similarity threshold $\tau_v = 0.65$, Full-text search rank threshold $\tau_{\text{lex}} = 0.02$.
- **Corpus**: 4 synthetic policy markdown files in `policies/examples/docs/` labeled "Prahari sample policy (fictional)".

## Dataset Splits
- `qa_pairs.json`: 40 curated Q/A pairs divided into:
  - `dev` (20 pairs): 15 in-scope questions covering all 4 policies and decision-to-clause mappings for runtime gateway rules (R1, R2, R3, R4, limits), plus 5 near-domain negative refusal queries. Used exclusively for threshold calibration.
  - `test` (20 pairs): 15 in-scope questions with varied phrasings, plus 5 near-domain negative refusal queries. Frozen and never used during tuning.
- `heldout_user.json`: Independent held-out evaluation dataset created for zero-tuning verification. Handled gracefully by the evaluation runner if present or absent.

## Authoring Notice & Limitations
> **Authoring Notice:** The 40 curated dev/test pairs in `qa_pairs.json` were authored by the same agent that generated the synthetic policy corpus. To avoid tuning bias, thresholds were tuned exclusively on the dev split and subsequently frozen.
>
> **Known Limitation (Near-Domain Negatives):** In dense semantic embedding spaces, queries in the same topical domain (e.g., credit card chargeback dispute windows, symmetric disk ciphers, biometric scanning consent, LLM hyperparameter limits) achieve high semantic similarity (~0.66–0.73) to policy documents in that domain (e.g. payments and consent policies). Without extractive predicate-level verification (Milestone 4b), dense+lexical retrieval alone will return topically related candidate chunks rather than refusing. For out-of-domain queries (e.g., paracetamol, sports, home repair), refusal is 100%.

## Running the Evaluation
```bash
# Run full evaluation against real PostgreSQL
cd services/api
uv run python evals/run_eval.py

# Run in CI mode (fails if dev/test Recall@3 < 1.0 or Top-1 < 0.90)
uv run python evals/run_eval.py --ci
```
