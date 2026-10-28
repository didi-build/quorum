/** Indexed chunk citation attached to chat answers (v1 `Citation`). */
export interface Citation {
  document_id: string;
  chunk_index: number;
  knowledge_source_id: string;
  excerpt: string;
}
