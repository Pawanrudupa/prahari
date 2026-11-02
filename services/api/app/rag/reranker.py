"""Optional ONNX cross-encoder reranker for Policy RAG.

Uses Xenova/ms-marco-MiniLM-L-6-v2 via FastEmbed's TextCrossEncoder.
Model properties:
- Model size: ~80 MB ONNX
- License: Apache 2.0
- Architecture: 6-layer MiniLM cross-encoder trained on MS MARCO
- Execution: ONNX Runtime CPU with single-thread allocation
- Production deployment across multiple workers: VERIFY memory footprint under load
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.core.config import settings

logger = logging.getLogger("prahari.rag.reranker")

# Dedicated bounded thread pool for cross-encoder inference (threads=1)
_RERANK_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="fastembed_rerank")
_RERANKER_INSTANCE: Any = None
_RERANK_LOCK = asyncio.Lock()


def _load_reranker_sync() -> Any:
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    logger.info("Initializing FastEmbed TextCrossEncoder (Xenova/ms-marco-MiniLM-L-6-v2)...")
    # Cap threads to 1 to prevent CPU contention with API gateway workers
    model = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2", threads=1)
    logger.info("Cross-encoder model initialized successfully.")
    return model


async def get_reranker_model() -> Any:
    """Lazy-load the cross-encoder singleton asynchronously."""
    global _RERANKER_INSTANCE

    if _RERANKER_INSTANCE is not None:
        return _RERANKER_INSTANCE

    async with _RERANK_LOCK:
        if _RERANKER_INSTANCE is None:
            loop = asyncio.get_running_loop()
            _RERANKER_INSTANCE = await loop.run_in_executor(_RERANK_EXECUTOR, _load_reranker_sync)
    return _RERANKER_INSTANCE


def _rerank_sync(model: Any, query: str, passages: list[str]) -> list[float]:
    """Compute cross-encoder relevance scores for query-passage pairs synchronously."""
    # FastEmbed TextCrossEncoder.rerank returns scores (higher means more relevant)
    scores = list(model.rerank(query, passages))
    return [float(s) for s in scores]


async def rerank_candidates(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Rerank candidate chunks using the cross-encoder model.

    If RAG_ENABLE_RERANKER is False or candidates is empty, returns original candidates unchanged.
    """
    if not settings.RAG_ENABLE_RERANKER or not candidates:
        return candidates[:top_k]

    try:
        model = await get_reranker_model()
        passages: list[str] = []
        for c in candidates:
            doc_title = c.get("document_title") or ""
            sec_title = c.get("section_title") or ""
            text = c.get("text") or ""
            passage = f"{doc_title} > {sec_title}\n\n{text}".strip()
            passages.append(passage)

        loop = asyncio.get_running_loop()
        scores = await loop.run_in_executor(_RERANK_EXECUTOR, _rerank_sync, model, query, passages)

        # Attach rerank score and sort descending
        scored_candidates: list[dict[str, Any]] = []
        for cand, score in zip(candidates, scores, strict=False):
            updated = dict(cand)
            updated["rerank_score"] = round(score, 4)
            scored_candidates.append(updated)

        scored_candidates.sort(key=lambda x: x.get("rerank_score", 0.0), reverse=True)
        return scored_candidates[:top_k]
    except Exception as exc:
        logger.warning(f"Cross-encoder reranking failed, falling back to original rank: {exc}")
        return candidates[:top_k]
