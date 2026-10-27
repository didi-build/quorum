import type { ConnectionRow } from "./types.js";

/** JSON shape expected by the Connections UI (`frontend/src/types/connections.ts`). */
export interface ConnectionApiItem {
  id: string;
  provider: "github" | "linear";
  connected: boolean;
  account_label: string | null;
}

export function connectionRowToApiItem(row: ConnectionRow): ConnectionApiItem {
  const connected =
    row.provider === "linear"
      ? row.access_token_ciphertext !== null && row.access_token_ciphertext !== ""
      : row.installation_id !== null && row.installation_id !== "";
  return {
    id: row.id,
    provider: row.provider,
    connected,
    account_label: connected ? row.external_account_name : null,
  };
}
