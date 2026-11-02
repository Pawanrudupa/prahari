"""Single source of truth for Policy RAG retrieval constants and thresholds."""

# Dense vector cosine similarity threshold
# (calibrated on dev split: in-scope >= 0.72, negatives <= 0.59)
DEFAULT_TAU_VECTOR: float = 0.65

# Full-text search ts_rank_cd threshold
DEFAULT_TAU_LEXICAL: float = 0.02

# Answerability gate: IDF-weighted query-term coverage threshold
# (calibrated on dev split: in-scope >= 0.25, near-domain negatives <= 0.21)
DEFAULT_C_MIN: float = 0.22

# Answerability gate: max document frequency for rare-term qualification
DEFAULT_MAX_RARE_DF: int = 4

# Reciprocal Rank Fusion constant (standard k=60)
RRF_K: float = 60.0

# Standard unweighted RRF component weights
DEFAULT_VECTOR_WEIGHT: float = 1.0
DEFAULT_TEXT_WEIGHT: float = 1.0

# Candidate pool multiplier for initial vector/FTS sweeps
CANDIDATE_POOL_MULTIPLIER: int = 4

# Output tiers for Policy RAG candidate items
TIER_STRONG_MATCH: str = "strong_match"
TIER_RELATED_UNVERIFIED: str = "related_unverified"
TIER_NO_RELEVANT_CLAUSE: str = "no_relevant_clause"
