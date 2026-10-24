import type { SourceType } from "./sources";

export type ConnectionProvider = "github" | "linear";

export interface Connection {
  id: string;
  provider: ConnectionProvider;
  connected: boolean;
  account_label: string | null;
}

export interface AvailableSourceItem {
  name: string;
  external_ref: string;
  private: boolean;
  key: string;
  already_added: boolean;
}

export interface CreateSourceInput {
  connection_id: string;
  source_type: SourceType;
  external_ref: string;
  name: string;
  key: string;
}
