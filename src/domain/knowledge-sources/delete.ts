import type { Env } from "../../env.js";
import {
  deleteChunkVectors,
  type DeleteChunkVectors,
} from "../ingestion/delete-vectors.js";
import { vectorIdsForChunks } from "../ingestion/vector-id.js";

export type DeleteKnowledgeSourceOptions = {
  deleteChunkVectors?: DeleteChunkVectors;
};

export type PurgeKnowledgeSourceEnv = Pick<Env, "DB" | "VECTORIZE">;

/**
 * Deletes a knowledge source with no owner check: Vectorize vectors first (hashed namespaced ids),
 * then the D1 row (chunks and FTS rows cascade). Vector-first ordering allows retry if Vectorize fails.
 *
 * For system paths only (account deletion and similar). Never import from request handlers; use
 * deleteKnowledgeSource for owner-scoped deletes.
 */
export async function purgeKnowledgeSource(
  env: PurgeKnowledgeSourceEnv,
  knowledgeSourceId: string,
  options: DeleteKnowledgeSourceOptions = {},
): Promise<void> {
  const removeVectors = options.deleteChunkVectors ?? deleteChunkVectors;

  const chunkRows = await env.DB.prepare(
    `SELECT document_id, chunk_index FROM chunks WHERE knowledge_source_id = ?`,
  )
    .bind(knowledgeSourceId)
    .all<{ document_id: string; chunk_index: number }>();

  const vectorIds = await vectorIdsForChunks(
    knowledgeSourceId,
    chunkRows.results ?? [],
  );
  if (vectorIds.length > 0) {
    await removeVectors(env.VECTORIZE, vectorIds);
  }

  await env.DB.prepare("DELETE FROM knowledge_sources WHERE id = ?")
    .bind(knowledgeSourceId)
    .run();
}

/**
 * Deletes a knowledge source owned by ownerUserId. Returns false when no row matched id and user_id.
 */
export async function deleteKnowledgeSource(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  ownerUserId: string,
  options: DeleteKnowledgeSourceOptions = {},
): Promise<boolean> {
  const owned = await db
    .prepare(`SELECT id FROM knowledge_sources WHERE id = ? AND user_id = ?`)
    .bind(knowledgeSourceId, ownerUserId)
    .first<{ id: string }>();
  if (owned === null) {
    return false;
  }

  await purgeKnowledgeSource(
    { DB: db, VECTORIZE: vectorize },
    knowledgeSourceId,
    options,
  );

  const stillPresent = await db
    .prepare(`SELECT id FROM knowledge_sources WHERE id = ?`)
    .bind(knowledgeSourceId)
    .first();
  return stillPresent === null;
}
