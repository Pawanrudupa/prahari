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
  section_title: string | null;
  text: string;
  checksum_sha256: string;
  meta: Record<string, unknown> | null;
}

export interface RAGSearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  section_title: string | null;
  text: string;
  checksum_sha256: string;
  cosine_similarity: number | null;
  lexical_rank: number | null;
  rrf_score: number;
  grounded: boolean;
}

export interface RAGSearchResponse {
  query: string;
  retrieval_mode: "hybrid" | "vector_only" | "lexical_only" | "empty";
  total_matches: number;
  results: RAGSearchResult[];
}

export interface LoadSampleDocsResponse {
  loaded_count: number;
  skipped_count: number;
  documents: PolicyDocumentItem[];
}
