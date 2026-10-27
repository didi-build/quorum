export type ConnectionProvider = "github" | "linear";

export interface ConnectionRead {
  id: string;
  user_id: string;
  provider: ConnectionProvider;
  external_account_id: string;
  external_account_name: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionListResponse {
  connections: ConnectionRead[];
}
