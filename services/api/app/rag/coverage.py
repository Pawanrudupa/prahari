"""Deterministic, explainable answerability gating for Policy RAG.

Evaluates IDF-weighted query-term coverage and rare-term matching against candidate chunks
to prevent false-positive grounding on near-domain out-of-scope queries.
"""

from __future__ import annotations

import math
import re
from typing import Any

# Standard English stopwords
STOPWORDS: frozenset[str] = frozenset(
    {
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "aren't",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "can't",
        "cannot",
        "could",
        "couldn't",
        "did",
        "didn't",
        "do",
        "does",
        "doesn't",
        "doing",
        "don't",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "hadn't",
        "has",
        "hasn't",
        "have",
        "haven't",
        "having",
        "he",
        "he'd",
        "he'll",
        "he's",
        "her",
        "here",
        "here's",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "how's",
        "i",
        "i'd",
        "i'll",
        "i'm",
        "i've",
        "if",
        "in",
        "into",
        "is",
        "isn't",
        "it",
        "it's",
        "its",
        "itself",
        "let's",
        "me",
        "more",
        "most",
        "mustn't",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "ought",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "shan't",
        "she",
        "she'd",
        "she'll",
        "she's",
        "should",
        "shouldn't",
        "so",
        "some",
        "such",
        "than",
        "that",
        "that's",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "there's",
        "these",
        "they",
        "they'd",
        "they'll",
        "they're",
        "they've",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "wasn't",
        "we",
        "we'd",
        "we'll",
        "we're",
        "we've",
        "were",
        "weren't",
        "what",
        "what's",
        "when",
        "when's",
        "where",
        "where's",
        "which",
        "while",
        "who",
        "who's",
        "whom",
        "why",
        "why's",
        "with",
        "won't",
        "would",
        "wouldn't",
        "you",
        "you'd",
        "you'll",
        "you're",
        "you've",
        "your",
        "yours",
        "yourself",
        "yourselves",
        # Common domain fill words that do not carry discriminative intent
        "must",
        "shall",
        "may",
        "require",
        "required",
        "need",
        "needs",
        "mandatory",
    }
)


def stem_term(term: str) -> str:
    """Lightweight rule-based morphological stemmer for legal and policy tokens."""
    w = term.lower().strip()
    if len(w) <= 3:
        return w

    # Irregular / domain word stems
    domain_map = {
        "withdrawal": "withdraw",
        "withdrawing": "withdraw",
        "withdrawn": "withdraw",
        "administrative": "administr",
        "administration": "administr",
        "administrator": "administr",
        "approval": "approv",
        "approvals": "approv",
        "approving": "approv",
        "approved": "approv",
        "permission": "permiss",
        "permissions": "permiss",
        "repurposing": "repurpos",
        "repurpose": "repurpos",
        "repurposed": "repurpos",
        "obligation": "oblig",
        "obligations": "oblig",
        "disclosure": "disclos",
        "disclosures": "disclos",
        "jurisdiction": "jurisdict",
        "jurisdictions": "jurisdict",
        "disputes": "dispute",
        "refunding": "refund",
        "refunds": "refund",
        "masking": "mask",
        "masked": "mask",
        "optional": "opt",
        "option": "opt",
        "options": "opt",
        "revoking": "revoc",
        "revoked": "revoc",
        "revocation": "revoc",
        "revocations": "revoc",
    }
    if w in domain_map:
        return domain_map[w]

    # Standard suffix stripping
    for suffix in ("ing", "tion", "sion", "ment", "ness", "ities", "ity", "ies", "ed", "al", "ly"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[: -len(suffix)]
            break

    # Strip trailing 's' if not 'ss'
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        w = w[:-1]

    return w


def extract_content_terms(text: str) -> list[str]:
    """Tokenize text into lowercased, stopword-filtered, lightly stemmed content terms."""
    # Split on whitespace and punctuation
    raw_tokens = re.findall(r"[A-Za-z0-9]+", text.lower())
    terms: list[str] = []
    for token in raw_tokens:
        clean = token.strip()
        if len(clean) >= 2 and clean not in STOPWORDS:
            stemmed = stem_term(clean)
            if stemmed and stemmed not in STOPWORDS and len(stemmed) >= 2:
                terms.append(stemmed)
    return terms


def build_corpus_df(corpus_texts: list[str]) -> tuple[dict[str, int], int]:
    """Compute document frequency (df) for all terms across corpus chunks.

    Returns:
        (term_dfs, total_chunk_count)
    """
    total_chunks = len(corpus_texts)
    term_dfs: dict[str, int] = {}
    for text in corpus_texts:
        terms_in_chunk = set(extract_content_terms(text))
        for t in terms_in_chunk:
            term_dfs[t] = term_dfs.get(t, 0) + 1
    return term_dfs, total_chunks


def compute_term_idf(term: str, term_dfs: dict[str, int], total_chunks: int) -> float:
    """Compute smoothed BM25 IDF for a term given corpus df and total chunk count.

    Unseen terms (df=0) receive the maximum penalty IDF: ln(1 + (N + 0.5) / 0.5).
    """
    df = term_dfs.get(term, 0)
    # BM25 standard smoothed IDF: ln(1 + (N - df + 0.5) / (df + 0.5))
    n = max(total_chunks, 1)
    return math.log(1.0 + (n - df + 0.5) / (df + 0.5))


def compute_rare_term_ceiling(
    total_chunks: int,
    min_floor: int = 4,
    fraction: float = 0.15,
) -> int:
    """Compute corpus-relative rare-term df ceiling with a minimum floor.

    For small corpora (e.g. current 25 chunks): max(4, ceil(0.15 * 25)) = max(4, 4) = 4.
    For 5x larger corpora (e.g. 125 chunks): max(4, ceil(0.15 * 125)) = max(4, 19) = 19.
    """
    return max(min_floor, math.ceil(fraction * max(total_chunks, 1)))


def evaluate_query_chunk_coverage(
    query: str,
    chunk_text: str,
    chunk_section_title: str | None,
    document_title: str | None,
    term_dfs: dict[str, int],
    total_chunks: int,
    c_min: float = 0.22,
    max_rare_df: int | None = None,
) -> dict[str, Any]:
    """Evaluate IDF-weighted content-term coverage and rare-term match.

    Returns:
        {
            "coverage_score": float,
            "rare_term_matched": bool,
            "is_closest_clause": bool,
            "is_strong_match": bool,
            "effective_max_rare_df": int,
            "matched_terms": list[str],
            "unmatched_terms": list[str],
            "query_terms": list[str],
        }
    """
    effective_max_rare = (
        max_rare_df if max_rare_df is not None else compute_rare_term_ceiling(total_chunks)
    )

    q_terms = extract_content_terms(query)
    if not q_terms:
        return {
            "coverage_score": 0.0,
            "rare_term_matched": False,
            "is_closest_clause": False,
            "is_strong_match": False,
            "effective_max_rare_df": effective_max_rare,
            "matched_terms": [],
            "unmatched_terms": [],
            "query_terms": [],
        }

    # Combined candidate text includes document title, section hierarchy, and chunk text
    candidate_parts: list[str] = []
    if document_title:
        candidate_parts.append(document_title)
    if chunk_section_title:
        candidate_parts.append(chunk_section_title)
    candidate_parts.append(chunk_text)
    combined_candidate = " ".join(candidate_parts)

    candidate_token_set = set(extract_content_terms(combined_candidate))

    # Distinct query terms to avoid duplicate IDF inflation
    unique_q_terms = list(dict.fromkeys(q_terms))

    total_query_idf = 0.0
    matched_query_idf = 0.0
    matched_terms: list[str] = []
    unmatched_terms: list[str] = []
    rare_term_matched = False

    for t in unique_q_terms:
        idf = compute_term_idf(t, term_dfs, total_chunks)
        total_query_idf += idf

        # Check if term appears in candidate tokens
        if t in candidate_token_set:
            matched_query_idf += idf
            matched_terms.append(t)
            df = term_dfs.get(t, 0)
            if 1 <= df <= effective_max_rare:
                rare_term_matched = True
        else:
            unmatched_terms.append(t)

    coverage_score = (matched_query_idf / total_query_idf) if total_query_idf > 0.0 else 0.0
    is_strong = (coverage_score >= c_min) and rare_term_matched

    return {
        "coverage_score": round(coverage_score, 4),
        "rare_term_matched": rare_term_matched,
        "is_closest_clause": is_strong,
        "is_strong_match": is_strong,
        "effective_max_rare_df": effective_max_rare,
        "matched_terms": matched_terms,
        "unmatched_terms": unmatched_terms,
        "query_terms": unique_q_terms,
    }
