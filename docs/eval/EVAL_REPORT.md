# Prahari Policy RAG Evaluation Report (Milestone 4a.2 Frozen)

> **Status:** Retrieval Code and Thresholds Frozen
> **Embedding Model:** FastEmbed `BAAI/bge-small-en-v1.5` (384-d, ONNX int8/float32, threads=1, sem=2)
> **Cross-Encoder Model:** FastEmbed `Xenova/ms-marco-MiniLM-L-6-v2` (~80 MB, Apache 2.0, threads=1)
> **Active Retrieval Constants:** $\tau_v = 0.65$, $\tau_{\text{lex}} = 0.02$, $k=60$
> **Answerability Gate:** $c_{\text{min}} = 0.22$, $\text{df}_{\text{max\_rare}} = 4$

## Benchmark Summary Table

| Split | Total Queries | Recall@3 | Top-1 Gold | MRR | Near-Domain | Far-Domain | Total Refusal |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dev (Base)** | 35 | 25/25 (100.0%) | **92.0%** | **0.947** | 10/10 (100.0%) | 0/0 (100.0%) | **10/10 (100.0%)** |
| **Dev (Rerank)** | 35 | 25/25 (100.0%) | **92.0%** | **0.960** | 10/10 (100.0%) | 0/0 (100.0%) | **10/10 (100.0%)** |
| **Test (Base)** | 20 | 15/15 (100.0%) | **93.3%** | **0.967** | 1/1 (100.0%) | 4/4 (100.0%) | **5/5 (100.0%)** |
| **Test (Rerank)** | 20 | 15/15 (100.0%) | **100.0%** | **1.000** | 1/1 (100.0%) | 4/4 (100.0%) | **5/5 (100.0%)** |

## Score & Coverage Distributions
- **Dev In-Scope Cosine**: min=0.665, med=0.747, max=0.865
- **Dev Out-of-Scope Cosine**: min=0.675, med=0.698, max=0.710
- **Dev In-Scope Term Coverage**: min=0.100, med=0.355, max=1.000
- **Dev Out-of-Scope Term Coverage**: min=0.034, med=0.120, max=0.211

## Demo Rule Coverage (R1-R6 + Limits)
- **R1 (PII Masking)**: `Data Handling Policy > Section 3.1` — Top-1 Hit
- **R2 (Dual Auth Escalation)**: `Payments Fraud Policy > Section 2.2` — Top-1 Hit
- **R3 (Bulk Export)**: `Data Handling Policy > Section 3.2` — Top-1 Hit
- **R4 (Consent Revocation)**: `Consent Governance Policy > Section 3.1` — Top-1 Hit
- **R5 (Emergency Key Revocation)**: `Access Control Policy > Section 4.2` — Top-1 Hit
- **R6 (Policy Modification Sign-off)**: `Access Control Policy > 4.1` — Top-1 Hit
- **Limits (Daily Cap & Velocity)**: `Payments Fraud Policy > 3.1 & 3.2` — Top-1 Hit

## Hardware & Performance Profile (Measured)
- **FastEmbed Embedding Cold Start**: ~180 ms (lazy initialized into ThreadPoolExecutor)
- **FastEmbed Cross-Encoder Cold Start**: ~240 ms
- **Cross-Encoder Rerank Latency (3 Candidates)**: ~69 ms total (~23 ms/candidate)
- **Docker Image Overhead**: +115 MB (FastEmbed ONNX runtime without PyTorch/CUDA)
- **API RSS Memory Usage**: ~145 MB base, ~215 MB with both ONNX models loaded
- **Interference Control**: Intra-op threads strictly capped to 1; bounded semaphore.

## Honest Evaluation Protocol & Tuning History
1. The 15 questions from `heldout_user.json` were promoted to dev as instructed.
2. Thresholds were calibrated exclusively on the dev split and subsequently frozen.
3. Independent `docs/eval/heldout_user_2.json` will be evaluated ONCE without tuning.
