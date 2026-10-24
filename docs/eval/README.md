# Prahari Policy RAG Evaluation Suite

Deterministic benchmark evaluation for Policy RAG hybrid semantic retrieval.

- `qa_pairs.json`: 35 curated Q/A pairs (15 dev, 20 test), including in-scope direct clauses, paraphrased semantic queries, and out-of-scope negative refusal cases.
- `EVAL_REPORT.md`: Baseline benchmark metrics for Recall@3, MRR, Citation Precision, and Refusal Correctness.
- Runner: `uv run python -m evals.run_eval` from `services/api`.
