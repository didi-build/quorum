import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let bootstrapEnsured = false;

export async function ensureBootstrapApiKey(
  db: D1Database,
  config: QuorumConfig,
): Promise<void> {
  if (bootstrapEnsured) {
    return;
  }
  const keyHash = await hashApiKey(config.bootstrapApiKey);
  const existing = await db
    .prepare("SELECT id FROM api_keys WHERE key_hash = ? LIMIT 1")
    .bind(keyHash)
    .first<{ id: string }>();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
      )
      .bind(crypto.randomUUID(), keyHash)
      .run();
  }
  bootstrapEnsured = true;
}

/** Reset bootstrap guard for isolated tests. */
export function resetBootstrapApiKeyGuard(): void {
  bootstrapEnsured = false;
}

export async function validateApiKey(
  db: D1Database,
  config: QuorumConfig,
  apiKey: string,
): Promise<{ userId: string; projectId: string | null } | null> {
  const keyHash = await hashApiKey(apiKey);
  const record = await db
    .prepare("SELECT user_id, project_id FROM api_keys WHERE key_hash = ? LIMIT 1")
    .bind(keyHash)
    .first<{ user_id: string | null; project_id: string | null }>();

  if (!record) {
    return null;
  }
  if (record.user_id === null || record.user_id === undefined) {
    return { userId: config.defaultUserId, projectId: record.project_id };
  }
  return { userId: record.user_id, projectId: record.project_id };
}
