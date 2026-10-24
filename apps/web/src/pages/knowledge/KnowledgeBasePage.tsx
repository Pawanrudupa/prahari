import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Upload,
  Search,
  FileText,
  Archive,
  Layers,
  AlertTriangle,
  X,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  fetchPolicyDocuments,
  fetchDocumentChunks,
  archivePolicyDocument,
  uploadPolicyDocument,
  searchPolicyCorpus,
  loadSampleDocs,
} from "../../services/ragApi";
import type {
  PolicyDocumentItem,
} from "../../types/rag";

export function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken);

  // Filter & modal states
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedDocForChunks, setSelectedDocForChunks] = useState<PolicyDocumentItem | null>(null);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Inspector / Search State
  const [searchQuery, setSearchQuery] = useState(
    "What is the maximum single-transaction limit for an automated payment agent?",
  );
  const [topK, setTopK] = useState(3);
  const [tauVector, setTauVector] = useState(0.65);
  const [tauLexical, setTauLexical] = useState(0.05);

  // 1. Query: Documents List
  const {
    data: documents = [],
    isLoading: isDocsLoading,
    error: docsError,
  } = useQuery({
    queryKey: ["policy-documents", includeArchived],
    queryFn: () => fetchPolicyDocuments(includeArchived, sessionToken),
  });

  // 2. Query: Chunks for selected document
  const {
    data: activeChunks = [],
    isLoading: isChunksLoading,
  } = useQuery({
    queryKey: ["policy-chunks", selectedDocForChunks?.id],
    queryFn: () =>
      selectedDocForChunks ? fetchDocumentChunks(selectedDocForChunks.id, sessionToken) : Promise.resolve([]),
    enabled: !!selectedDocForChunks,
  });

  // 3. Mutation: Upload Document
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      return uploadPolicyDocument(selectedFile, docTitle || undefined, sessionToken);
    },
    onSuccess: () => {
      setSelectedFile(null);
      setDocTitle("");
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["policy-documents"] });
    },
    onError: (err: any) => {
      setUploadError(err.message || "Failed to upload document");
    },
  });

  // 4. Mutation: Archive Document
  const archiveMutation = useMutation({
    mutationFn: (docId: string) => archivePolicyDocument(docId, sessionToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policy-documents"] });
    },
  });

  // 5. Mutation: Load Sample Policies
  const sampleDocsMutation = useMutation({
    mutationFn: () => loadSampleDocs(sessionToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policy-documents"] });
    },
  });

  // 6. Mutation: Interactive Search / Inspector
  const searchMutation = useMutation({
    mutationFn: () =>
      searchPolicyCorpus(
        searchQuery,
        { topK, tauVector, tauLexical },
        sessionToken,
      ),
  });

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Knowledge Base & Policy RAG
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Milestone 4a
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Hybrid semantic search with pgvector dense embeddings, PostgreSQL tsvector FTS, and RRF rank fusion.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900/60 border border-white/[0.08] px-3.5 py-2 rounded-xl text-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Documents</span>
            <span className="text-base font-bold text-white font-mono">{documents.length}</span>
          </div>
          <div className="bg-slate-900/60 border border-white/[0.08] px-3.5 py-2 rounded-xl text-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Indexed Chunks</span>
            <span className="text-base font-bold text-cyan-400 font-mono">{totalChunks}</span>
          </div>
          <div className="bg-slate-900/60 border border-white/[0.08] px-3.5 py-2 rounded-xl text-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Model Runtime</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono flex items-center gap-1 justify-center mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              BGE-small ONNX
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Document Corpus (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Upload Card */}
          <div className="bg-slate-900/40 border border-white/[0.08] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <Upload className="w-4 h-4 text-cyan-400" />
              Ingest Policy Document
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Document Title (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Data Handling Policy"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  File (.md, .txt, .pdf, max 5 MB)
                </label>
                <input
                  type="file"
                  accept=".md,.txt,.pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 file:cursor-pointer cursor-pointer"
                />
              </div>
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg p-3 mb-4">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Documents are sanitized, chunked with section preservation, and hash-verified.
              </span>
              <button
                type="button"
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploadMutation.isPending}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-medium text-xs transition-colors flex items-center gap-1.5"
              >
                {uploadMutation.isPending ? "Ingesting..." : "Upload & Index"}
              </button>
            </div>
          </div>

          {/* Documents Table */}
          <div className="bg-slate-900/40 border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                Indexed Policy Corpus
              </h2>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => setIncludeArchived(e.target.checked)}
                    className="rounded bg-slate-950 border-white/[0.2] text-cyan-500 focus:ring-0"
                  />
                  Show Archived
                </label>
                <button
                  type="button"
                  onClick={() => sampleDocsMutation.mutate()}
                  disabled={sampleDocsMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 border border-white/[0.08] transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  {sampleDocsMutation.isPending ? "Loading..." : "Load Sample Docs"}
                </button>
              </div>
            </div>

            {isDocsLoading ? (
              <div className="p-8 text-center text-xs font-mono text-slate-500">
                Loading policy documents...
              </div>
            ) : docsError ? (
              <div className="p-6 text-center text-xs text-rose-400 font-mono">
                Failed to load documents: {(docsError as Error).message}
              </div>
            ) : documents.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800/60 border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-medium text-white mb-1">No policy documents found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Upload an existing policy document above or load the 4 canonical synthetic test policies.
                </p>
                <button
                  type="button"
                  onClick={() => sampleDocsMutation.mutate()}
                  disabled={sampleDocsMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium text-xs transition-colors inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {sampleDocsMutation.isPending ? "Loading Samples..." : "Load Sample Policies"}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[10px] border-b border-white/[0.08]">
                    <tr>
                      <th className="py-2.5 px-4">Title</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Chunks</th>
                      <th className="py-2.5 px-3">SHA-256</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-200">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate max-w-[180px]" title={doc.title}>
                              {doc.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300">
                            {doc.doc_type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono">
                          {(doc.file_size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3 px-3 font-mono text-cyan-400 font-semibold">
                          {doc.chunk_count}
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-slate-500">
                          <span title={doc.checksum_sha256}>
                            {doc.checksum_sha256.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                              doc.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDocForChunks(doc)}
                              className="px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-[11px] transition-colors inline-flex items-center gap-1"
                            >
                              <Layers className="w-3 h-3 text-cyan-400" />
                              Chunks
                            </button>
                            {doc.status === "active" && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Archive document "${doc.title}"?`)) {
                                    archiveMutation.mutate(doc.id);
                                  }
                                }}
                                disabled={archiveMutation.isPending}
                                className="px-2 py-1 rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 text-[11px] transition-colors"
                                title="Soft-archive document"
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: "Ask Your Policies" Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/40 border border-white/[0.08] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <Search className="w-4 h-4 text-cyan-400" />
              Ask Your Policies (RAG Inspector)
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Test semantic hybrid retrieval against active policy documents with absolute threshold gating.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Policy Query
                </label>
                <textarea
                  rows={2}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask a policy question..."
                  className="w-full bg-slate-950 border border-white/[0.1] rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Threshold Controls */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-xl border border-white/[0.04]">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>Top K</span>
                    <span className="text-cyan-400 font-bold">{topK}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>Cosine (&tau;<sub>v</sub>)</span>
                    <span className="text-cyan-400 font-bold">{tauVector.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.30"
                    max="0.85"
                    step="0.05"
                    value={tauVector}
                    onChange={(e) => setTauVector(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>FTS (&tau;<sub>lex</sub>)</span>
                    <span className="text-cyan-400 font-bold">{tauLexical.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.15"
                    step="0.01"
                    value={tauLexical}
                    onChange={(e) => setTauLexical(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => searchMutation.mutate()}
                disabled={!searchQuery.trim() || searchMutation.isPending}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
              >
                <Search className="w-3.5 h-3.5" />
                {searchMutation.isPending ? "Executing Hybrid Retrieval..." : "Search Policy Corpus"}
              </button>
            </div>

            {/* Search Results Display */}
            {searchMutation.data && (
              <div className="mt-4 border-t border-white/[0.08] pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">
                    Mode:{" "}
                    <span
                      className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                        searchMutation.data.retrieval_mode === "hybrid"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : searchMutation.data.retrieval_mode === "vector_only"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : searchMutation.data.retrieval_mode === "lexical_only"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {searchMutation.data.retrieval_mode}
                    </span>
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {searchMutation.data.total_matches} matched clause(s)
                  </span>
                </div>

                {searchMutation.data.total_matches === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-amber-500/20 text-slate-300 text-xs">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold mb-1">
                      <ShieldAlert className="w-4 h-4" />
                      Refusal: No Grounded Policy Clauses
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      No policy clauses in the active corpus satisfied the minimum relevance threshold
                      (&tau;<sub>v</sub> &ge; {tauVector.toFixed(2)}). The system refuses speculation to ensure
                      governance integrity.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                    {searchMutation.data.results.map((hit, idx) => (
                      <div
                        key={hit.chunk_id}
                        className="p-3 rounded-xl bg-slate-950/80 border border-white/[0.08] hover:border-cyan-500/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <span className="text-[10px] font-mono text-cyan-400 font-bold mr-1.5">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-200">
                              {hit.section_title || hit.document_title}
                            </span>
                          </div>
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Grounded
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 mb-2">
                          <span>Doc: {hit.document_title}</span>
                          {hit.cosine_similarity !== null && (
                            <span>Sim: {hit.cosine_similarity.toFixed(3)}</span>
                          )}
                          {hit.lexical_rank !== null && (
                            <span>FTS: {hit.lexical_rank.toFixed(3)}</span>
                          )}
                          <span className="text-cyan-400">RRF: {hit.rrf_score.toFixed(4)}</span>
                        </div>

                        <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/60 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed border border-white/[0.04] overflow-x-auto">
                          {hit.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chunk Viewer Modal */}
      {selectedDocForChunks && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/[0.1] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Sequential Chunks: {selectedDocForChunks.title}
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  SHA-256: {selectedDocForChunks.checksum_sha256}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDocForChunks(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {isChunksLoading ? (
                <div className="p-8 text-center text-xs font-mono text-slate-500">
                  Loading chunks...
                </div>
              ) : activeChunks.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No chunks generated for this document.
                </div>
              ) : (
                activeChunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-white/[0.06] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-cyan-400 font-mono">
                        Chunk #{chunk.chunk_index} — {chunk.section_title || "Body"}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {chunk.checksum_sha256.slice(0, 10)}...
                      </span>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-900/60 p-3 rounded-lg whitespace-pre-wrap leading-relaxed">
                      {chunk.text}
                    </pre>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-white/[0.08] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDocForChunks(null)}
                className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-xs font-medium text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
