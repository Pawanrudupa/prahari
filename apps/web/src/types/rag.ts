export interface PolicyDocumentItem {
  id: string;
  title: string;
  source: string | null;
  doc_type: string;
  file_size_bytes: number;
  checksum_sha256: string;
  status: "active" | "archived";
  chunk_count: number;
  uploaded_at: string;
  archived_at: string | null;
}

export interface PolicyChunkItem {
  id: string;
  document_id: string;
  document_title: string | null;
  chunk_index: number;
  section_id: string | null;
  section_title: string | null;
  text: string;
  checksum_sha256: string;
  meta: Record<string, unknown> | null;
}

export type MatchTier =
  | "closest_clause"
  | "weakly_related"
  | "no_relevant_clause"
  | "strong_match"
  | "related_unverified";

export interface RAGSearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  section_id?: string | null;
  section_title: string | null;
  text: string;
  checksum_sha256: string;
  cosine_similarity: number | null;
  lexical_rank: number | null;
  rrf_score: number;
  coverage_score?: number;
  rare_term_matched?: boolean;
  match_tier?: MatchTier;
  rerank_score?: number | null;
  grounded?: boolean;
}

export interface RAGSearchResponse {
  query: string;
  retrieval_mode: "hybrid" | "vector_only" | "lexical_only" | "empty";
  total_matches: number;
  results: RAGSearchResult[];
  standing_note?: string;
}

export interface LoadSampleDocsResponse {
  loaded_count: number;
  skipped_count: number;
  documents: PolicyDocumentItem[];
}

export interface DeclaredSourceItem {
  chunk_id: string;
  document_id: string;
  document_title: string;
  section_id: string | null;
  section_title: string | null;
  excerpt: string;
  checksum_sha256: string;
  is_archived: boolean;
  label: string;
}

export interface SuggestedSourceItem {
  chunk_id: string;
  document_id: string;
  document_title: string;
  section_id: string | null;
  section_title: string | null;
  excerpt: string;
  checksum_sha256: string;
  cosine_similarity: number | null;
  coverage_score: number;
  rare_term_matched: boolean;
  match_tier: string;
  label: string;
}

export interface DecisionExplanationResponse {
  decision_id: string;
  policy_version_id: string | null;
  corpus_hash: string;
  explainer_version: string;
  snapshot_sha256: string;
  as_of: string;
  grounded: boolean;
  status_label: string;
  why: {
    decision_id: string;
    action_id: string;
    outcome: string;
    reason: string;
    policy_version_id: string | null;
    rule_id: string | null;
    rule_description: string | null;
    agent_id: string | null;
    tool_name: string | null;
    data_classes: string[];
    risk_score: number | null;
    evaluator: string;
  };
  declared_sources: DeclaredSourceItem[];
  suggested_sources: SuggestedSourceItem[];
  standing_note: string;
  created_at: string;
}
