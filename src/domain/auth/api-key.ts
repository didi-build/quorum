import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Ensures the bootstrap API key hash exists in D1. Runs on each call (typically once per
 * isolate on the first request that loads config on a public or protected API path, not only `/ready`).
 *
 * Rotation: when `BOOTSTRAP_API_KEY` changes, stale bootstrap rows (`user_id IS NULL` with a
 * different hash) are deleted before insert. `INSERT OR IGNORE` avoids duplicate-key errors on
 * concurrent cold starts.
 */
export async function ensureBootstrapApiKey(
  db: D1Database,
  config: QuorumConfig,
): Promise<void> {
  const keyHash = await hashApiKey(config.bootstrapApiKey);

  await db
    .prepare("DELETE FROM api_keys WHERE user_id IS NULL AND key_hash != ?")
    .bind(keyHash)
    .run();

  await db
    .prepare(
      "INSERT OR IGNORE INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
    )
    .bind(crypto.randomUUID(), keyHash)
    .run();
}

/** No-op kept for tests that reset isolate-local guards between cases. */
export function resetBootstrapApiKeyGuard(): void {}

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
