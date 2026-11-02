"""Unit tests for answerability gate: IDF-weighted coverage and rare-term matching."""

from app.rag.coverage import (
    build_corpus_df,
    evaluate_query_chunk_coverage,
    extract_content_terms,
    stem_term,
)


def test_stem_term_domain_words() -> None:
    assert stem_term("withdrawal") == "withdraw"
    assert stem_term("withdrawing") == "withdraw"
    assert stem_term("administrative") == "administr"
    assert stem_term("approvals") == "approv"
    assert stem_term("repurposing") == "repurpos"
    assert stem_term("disclosures") == "disclos"
    assert stem_term("jurisdictions") == "jurisdict"


def test_extract_content_terms_filters_stopwords() -> None:
    text = "What is the mandatory cooling-off window for consent withdrawal?"
    terms = extract_content_terms(text)
    assert "what" not in terms
    assert "the" not in terms
    assert "for" not in terms
    assert "consent" in terms
    assert "withdraw" in terms
    assert "cool" in terms or "cooling" in terms


def test_answerability_gate_passes_in_scope_and_requires_rare_term() -> None:
    corpus = [
        "Data Handling Policy Section 2 Data Classification PII and SPI",
        "Payments Fraud Policy Section 2 Transaction Approval Thresholds above 50000",
        "Consent Governance Policy Section 3 Unconditional Right of Withdrawal within 72 hours",
        "Incident Management Policy Section 1 Immediate Revocation of compromised agent keys",
    ]
    term_dfs, total_chunks = build_corpus_df(corpus)

    # 1. In-scope query matching rare terms ("withdrawal", "72", "hours")
    q_in_scope = "What is the deadline for processing an unconditional consent withdrawal?"
    sample_text = (
        "Consent Governance Policy Section 3 Unconditional Right of Withdrawal within 72 hours"
    )
    res_in = evaluate_query_chunk_coverage(
        query=q_in_scope,
        chunk_text=sample_text,
        chunk_section_title="Section 3 > 3.1",
        document_title="Consent Governance Policy",
        term_dfs=term_dfs,
        total_chunks=total_chunks,
        c_min=0.22,
        max_rare_df=2,
    )
    assert res_in["coverage_score"] > 0.22
    assert res_in["rare_term_matched"] is True
    assert res_in["is_strong_match"] is True

    # 2. Out-of-scope query on ungrounded concepts (e.g. chargeback dispute arbitration SLA)
    q_out_scope = "What is the chargeback dispute arbitration SLA for merchant chargebacks?"
    res_out = evaluate_query_chunk_coverage(
        query=q_out_scope,
        chunk_text="Payments Fraud Policy Section 2 Transaction Approval Thresholds above 50000",
        chunk_section_title="Section 2 > 2.1",
        document_title="Payments Fraud Policy",
        term_dfs=term_dfs,
        total_chunks=total_chunks,
        c_min=0.22,
        max_rare_df=2,
    )
    # The out-of-scope terms ("chargeback", "dispute", "arbitration") have df=0 and fail to match
    assert res_out["rare_term_matched"] is False
    assert res_out["is_strong_match"] is False
