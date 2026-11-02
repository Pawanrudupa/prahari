# Prahari Policy RAG Evaluation Suite (Milestone 4a.2)

Deterministic benchmark evaluation for Policy RAG hybrid semantic retrieval and explainable answerability gating.

## Overview
- **Retrieval Architecture**: FastEmbed `BAAI/bge-small-en-v1.5` (384-dimensional dense vectors via ONNX Runtime) combined with PostgreSQL TSVector Full-Text Search (OR-semantics tsquery with stopword filtering) using Reciprocal Rank Fusion (standard unweighted $k=60$).
- **Context-Enriched Embedding**: Document chunks are embedded with full document title and hierarchical section path context (`f"{doc.title} > {section_title}\n\n{text}"`).
- **Answerability Gate (Deterministic & Explainable)**:
  - Query content terms (stopword-filtered, lightly stemmed) must exceed IDF-weighted coverage threshold $c_{\text{min}} = 0.22$.
  - At least one matched term must be a rare term ($\text{df} \le 4$ chunks across the corpus).
  - Out-of-corpus terms ($df=0$) receive maximal penalty BM25 IDF, naturally deflating coverage on ungrounded concepts (chargeback SLAs, AES ciphers, biometrics).
- **Optional Cross-Encoder Reranker**:
  - Model: `Xenova/ms-marco-MiniLM-L-6-v2` (~80 MB ONNX, Apache 2.0).
  - Execution: CPU single-thread (`threads=1`), bounded latency (~23 ms/candidate).
  - Gated behind `RAG_ENABLE_RERANKER: bool = False` in application settings.
- **Output Tiers**:
  - **"Strong match"** (cyan badge): Passes vector $\tau_v \ge 0.65$ + answerability coverage $\ge 0.22$ + rare term match.
  - **"Related, may not answer your question"** (amber badge & warning callout): Passes vector $\tau_v$ only, fails answerability gate.
  - **"No relevant clause"**: Refusal when no candidates pass $\tau_v$ or top candidate fails.
  - *Notice:* The green "Grounded" badge has been removed from the search inspector; "Grounded" is reserved exclusively for Milestone 4b declared rule sources.

## Dataset Splits
- `qa_pairs.json` (55 curated pairs):
  - `dev` (35 pairs): 25 in-scope questions covering all 4 policies, decision-to-clause mappings for runtime gateway rules (R1–R6, limits), plus 10 near-domain and out-of-scope negative refusal queries. The 15 queries from `heldout_user.json` were promoted to dev for calibration.
  - `test` (20 pairs): 15 in-scope questions with varied phrasings and section queries, plus 5 negative refusal queries. Frozen and never tuned.
- `heldout_user_2.json`: External independent held-out evaluation dataset evaluated with zero parameter tuning upon provision.

## Calibrated Thresholds (Frozen)
- Dense cosine similarity threshold: $\tau_v = 0.65$
- Full-text search rank threshold: $\tau_{\text{lex}} = 0.02$
- Answerability coverage threshold: $c_{\text{min}} = 0.22$
- Rare-term document frequency ceiling: $\text{df}_{\text{max\_rare}} = 4$
- RRF constant: $k = 60.0$

## Runtime & Resource Profile (Measured)
- **FastEmbed Embedding Cold Start**: ~180 ms (lazy initialized into dedicated ThreadPoolExecutor)
- **FastEmbed Cross-Encoder Cold Start**: ~240 ms
- **Cross-Encoder Rerank Latency (3 Candidates)**: ~69 ms total (~23 ms/candidate, single-thread)
- **Docker Image Overhead**: +115 MB (FastEmbed ONNX runtime without PyTorch/CUDA)
- **API RSS Memory Usage**: ~145 MB base, ~215 MB with both ONNX models loaded
- **Gateway Interference Control**: Intra-op threads strictly capped to 1; embedding concurrency bounded by `asyncio.Semaphore(2)`.
- **Gateway Pipeline p95**: Sequential p95 = **26.59 ms** (< 50 ms budget); Under concurrent RAG traffic = **35.04 ms** (< 50 ms budget).

## Running the Evaluation
```bash
# Run full evaluation against real PostgreSQL
cd services/api
uv run python evals/run_eval.py

# Run in CI mode (enforces strict, separate in-scope and refusal quality gates)
uv run python evals/run_eval.py --ci
```
