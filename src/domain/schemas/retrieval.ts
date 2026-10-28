/** Max top k after coverage expansion (v1 parity). */
export const RETRIEVAL_EXPANSION_CAP = 50;

export interface RetrievedChunk {
  chunk_id: number;
  knowledge_source_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading_hierarchy: string[];
  rrf_score: number;
  vector_rank: number | null;
  keyword_rank: number | null;
}

export interface RetrievalResponse {
  query: string;
  chunks: RetrievedChunk[];
  coverage_sufficient: boolean;
  coverage_score: number;
  expanded: boolean;
}

export interface RetrievalRequestBody {
  query: string;
  project_id?: string | null;
  top_k?: number | null;
}
