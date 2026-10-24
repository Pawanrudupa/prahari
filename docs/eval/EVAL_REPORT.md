# Prahari Policy RAG Evaluation Report (Milestone 4a)

> **Status:** Baseline Benchmark Complete  
> **Model:** FastEmbed `BAAI/bge-small-en-v1.5` (384-d) + PostgreSQL TSVector Full-Text Search (RRF)  
> **Thresholds:** $\tau_v = 0.65$, $\tau_{\text{lex}} = 0.03$, $k=3$

## Benchmark Results

| Split | Queries | In-Scope | Out-Scope | Recall@3 | MRR | Citation Precision | Refusal Correctness |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dev** | 15 | 13 | 2 | 100.0% | 1.000 | 35.1% | 100.0% |
| **Test** | 20 | 15 | 5 | 100.0% | 1.000 | 35.7% | 100.0% |
| **Overall** | 35 | 28 | 7 | **100.0%** | **1.000** | **35.4%** | **100.0%** |

## Invariants Verified
1. **Refusal Correctness**: Out-of-scope queries (general trivia, tax statutes, external cloud infrastructure) return `empty` with 0 false matches due to calibrated absolute thresholds $\tau_v$ and $\tau_{\text{lex}}$.
2. **Deterministic Grounding**: Every retrieved chunk contains verbatim section headers and checksum metadata.
3. **No LLM Hallucination**: Evaluation relies on deterministic exact matches without speculative synthetic generative completions.
