import type {
  LoadSampleDocsResponse,
  PolicyChunkItem,
  PolicyDocumentItem,
  RAGSearchResponse,
} from "../types/rag";
import { ApiError } from "./api";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore json parse error
    }
    throw new ApiError(response.status, errorDetail);
  }

  return response.json() as Promise<T>;
}

export async function uploadPolicyDocument(
  file: File,
  title: string | undefined,
  token?: string | null,
): Promise<PolicyDocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  if (title && title.trim()) {
    formData.append("title", title.trim());
  }

  return request<PolicyDocumentItem>(
    "/v1/rag/documents",
    {
      method: "POST",
      body: formData,
    },
    token,
  );
}

export async function fetchPolicyDocuments(
  includeArchived = false,
  token?: string | null,
): Promise<PolicyDocumentItem[]> {
  const query = includeArchived ? "?include_archived=true" : "";
  return request<PolicyDocumentItem[]>(`/v1/rag/documents${query}`, { method: "GET" }, token);
}

export async function fetchDocumentChunks(
  documentId: string,
  token?: string | null,
): Promise<PolicyChunkItem[]> {
  return request<PolicyChunkItem[]>(
    `/v1/rag/documents/${documentId}/chunks`,
    { method: "GET" },
    token,
  );
}

export async function archivePolicyDocument(
  documentId: string,
  token?: string | null,
): Promise<PolicyDocumentItem> {
  return request<PolicyDocumentItem>(
    `/v1/rag/documents/${documentId}/archive`,
    { method: "POST" },
    token,
  );
}

export async function searchPolicyCorpus(
  query: string,
  options: {
    topK?: number;
    tauVector?: number;
    tauLexical?: number;
  } = {},
  token?: string | null,
): Promise<RAGSearchResponse> {
  return request<RAGSearchResponse>(
    "/v1/rag/search",
    {
      method: "POST",
      body: JSON.stringify({
        query,
        top_k: options.topK ?? 5,
        tau_vector: options.tauVector ?? 0.65,
        tau_lexical: options.tauLexical ?? 0.05,
      }),
    },
    token,
  );
}

export async function loadSampleDocs(token?: string | null): Promise<LoadSampleDocsResponse> {
  return request<LoadSampleDocsResponse>(
    "/v1/dev/load-sample-docs",
    { method: "POST" },
    token,
  );
}
