"""FastEmbed BGE-small-en-v1.5 embedding runtime with bounded thread pool."""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

logger = logging.getLogger("prahari.rag.embeddings")

# Bounded thread pool so embedding inference never blocks the FastAPI async event loop
_EMBED_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fastembed_worker")

_MODEL_INSTANCE: Any = None
_RAG_READY: bool = False
_INIT_LOCK = asyncio.Lock()


def is_rag_ready() -> bool:
    """Return whether the embedding model is loaded and ready for inference."""
    return _RAG_READY


def _load_model_sync() -> Any:
    from fastembed import TextEmbedding

    # Model name: BAAI/bge-small-en-v1.5 (384-dimensional dense vectors)
    logger.info("Initializing FastEmbed BGE-small-en-v1.5 ONNX runtime...")
    model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    logger.info("FastEmbed model initialized successfully.")
    return model


async def get_embedding_model() -> Any:
    """Lazy-load the FastEmbed singleton model inside the bounded thread pool."""
    global _MODEL_INSTANCE, _RAG_READY

    if _MODEL_INSTANCE is not None:
        return _MODEL_INSTANCE

    async with _INIT_LOCK:
        if _MODEL_INSTANCE is None:
            try:
                loop = asyncio.get_running_loop()
                _MODEL_INSTANCE = await loop.run_in_executor(_EMBED_EXECUTOR, _load_model_sync)
                _RAG_READY = True
            except Exception as exc:
                logger.error(f"Failed to initialize FastEmbed embedding model: {exc}")
                _RAG_READY = False
                raise
    return _MODEL_INSTANCE


def _embed_texts_sync(model: Any, texts: list[str]) -> list[list[float]]:
    # fastembed returns generator of numpy arrays
    embeddings = list(model.embed(texts))
    return [emb.tolist() for emb in embeddings]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Compute dense embeddings for a batch of strings asynchronously."""
    if not texts:
        return []
    model = await get_embedding_model()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EMBED_EXECUTOR, _embed_texts_sync, model, texts)


async def embed_query(query: str) -> list[float]:
    """Compute dense embedding for a single search query asynchronously."""
    embeddings = await embed_texts([query])
    if not embeddings:
        raise ValueError("Failed to generate embedding for query")
    return embeddings[0]
