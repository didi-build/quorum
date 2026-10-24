export type Verdict = "approve" | "request_changes" | "comment";

export interface Citation {
  document_id: string;
  chunk_index: number;
  knowledge_source_id: string;
  excerpt: string;
}
