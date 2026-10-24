export type SourceType = "github_repo" | "linear";

export type SourceStatus = "pending" | "indexing" | "ready" | "error";

export interface KnowledgeSource {
  id: string;
  user_id: string | null;
  project_id: string | null;
  source_type: SourceType;
  external_ref: string;
  connection_id: string;
  name: string;
  status: SourceStatus;
  status_message: string | null;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSourceListResponse {
  sources: KnowledgeSource[];
}
