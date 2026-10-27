import type { D1Database } from "@cloudflare/workers-types";
import type { ConnectionProvider, ConnectionRead } from "../schemas/connections.js";

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

export function connectionRowToRead(row: ConnectionRow): ConnectionRead {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    external_account_id: row.external_account_id,
    external_account_name: row.external_account_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listAllConnections(db: D1Database): Promise<ConnectionRow[]> {
  const result = await db.prepare("SELECT * FROM connections").all<ConnectionRow>();
  return result.results ?? [];
}

export async function getConnectionById(
  db: D1Database,
  connectionId: string,
): Promise<ConnectionRow | null> {
  return await db
    .prepare("SELECT * FROM connections WHERE id = ?")
    .bind(connectionId)
    .first<ConnectionRow>();
}

export async function deleteConnectionById(
  db: D1Database,
  connectionId: string,
): Promise<void> {
  await db.prepare("DELETE FROM connections WHERE id = ?").bind(connectionId).run();
}
