import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import {
  DEV_VARS_EXAMPLE_PLACEHOLDERS,
  isDevelopmentAppEnv,
} from "../../config/placeholder-secrets.js";
import { sha256Hex } from "../../lib/crypto.js";

export async function hashApiKey(key: string): Promise<string> {
  return sha256Hex(key);
}

/**
 * Ensures the bootstrap API key hash exists in D1 once per isolate (first public or
 * protected API path that loads config, including `/ready`). Uses `INSERT OR IGNORE` for
 * concurrent cold starts.
 *
 * Bootstrap key rotation is manual: after `BOOTSTRAP_API_KEY` changes and deploy finishes,
 * delete the old `user_id IS NULL` row for the previous hash in D1.
 */
let bootstrapEnsurePromise: Promise<void> | null = null;

export function resetBootstrapApiKeyGuard(): void {
  bootstrapEnsurePromise = null;
}

export async function ensureBootstrapApiKey(
  db: D1Database,
  config: QuorumConfig,
): Promise<void> {
  if (bootstrapEnsurePromise) {
    return bootstrapEnsurePromise;
  }

  bootstrapEnsurePromise = insertBootstrapRowIfMissing(db, config);
  try {
    await bootstrapEnsurePromise;
  } catch (error) {
    bootstrapEnsurePromise = null;
    throw error;
  }
}

async function insertBootstrapRowIfMissing(
  db: D1Database,
  config: QuorumConfig,
): Promise<void> {
  const keyHash = await hashApiKey(config.bootstrapApiKey);
  await db
    .prepare(
      "INSERT OR IGNORE INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
    )
    .bind(crypto.randomUUID(), keyHash)
    .run();
}

export async function validateApiKey(
  db: D1Database,
  config: QuorumConfig,
  apiKey: string,
): Promise<{ userId: string; projectId: string | null } | null> {
  if (!isDevelopmentAppEnv(config.appEnv)) {
    const placeholders = DEV_VARS_EXAMPLE_PLACEHOLDERS.BOOTSTRAP_API_KEY ?? [];
    if (placeholders.includes(apiKey)) {
      return null;
    }
  }

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
