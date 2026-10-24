"""Single source of truth for Policy RAG retrieval constants and thresholds."""

# Dense vector cosine similarity threshold
# (calibrated on dev split: in-scope >= 0.72, negatives <= 0.59)
DEFAULT_TAU_VECTOR: float = 0.65

# Full-text search ts_rank_cd threshold
DEFAULT_TAU_LEXICAL: float = 0.02

# Reciprocal Rank Fusion constant (standard k=60)
RRF_K: float = 60.0

# Standard unweighted RRF component weights
DEFAULT_VECTOR_WEIGHT: float = 1.0
DEFAULT_TEXT_WEIGHT: float = 1.0

# Candidate pool multiplier for initial vector/FTS sweeps
CANDIDATE_POOL_MULTIPLIER: int = 4
