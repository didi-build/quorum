export type SourceType = "github_repo" | "linear";

export interface AvailableSourceItem {
  source_type: SourceType;
  external_ref: string;
  name: string;
  private: boolean | null;
  updated_at: string | null;
  key: string | null;
  already_added: boolean;
  source_id: string | null;
}

export interface AvailableSourcesResponse {
  provider: "github" | "linear";
  items: AvailableSourceItem[];
}
