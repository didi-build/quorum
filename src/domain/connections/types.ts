export type ConnectionProvider = "github" | "linear";

export type SourceType = "github_repo" | "linear";

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: ConnectionProvider;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  installation_id: string | null;
  external_account_id: string;
  external_account_name: string;
  created_at: string;
  updated_at: string;
}

export interface AvailableSourceItemInternal {
  source_type: SourceType;
  external_ref: string;
  name: string;
  private: boolean | null;
  key: string | null;
  already_added: boolean;
  source_id: string | null;
}
