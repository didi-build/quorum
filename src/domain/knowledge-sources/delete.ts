import {
  deleteChunkVectors,
  type DeleteChunkVectors,
} from "../ingestion/delete-vectors.js";
import { vectorIdsForChunks } from "../ingestion/vector-id.js";

export type DeleteKnowledgeSourceOptions = {
  deleteChunkVectors?: DeleteChunkVectors;
};

/**
 * Deletes a knowledge source owned by ownerUserId: Vectorize vectors first (hashed namespaced ids),
 * then the D1 row (chunks and FTS rows cascade). Returns false when no row matched id and user_id.
 */
export async function deleteKnowledgeSource(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  ownerUserId: string,
  options: DeleteKnowledgeSourceOptions = {},
): Promise<boolean> {
  const removeVectors = options.deleteChunkVectors ?? deleteChunkVectors;

  const owned = await db
    .prepare(`SELECT id FROM knowledge_sources WHERE id = ? AND user_id = ?`)
    .bind(knowledgeSourceId, ownerUserId)
    .first<{ id: string }>();
  if (owned === null) {
    return false;
  }

  const chunkRows = await db
    .prepare(
      `SELECT document_id, chunk_index FROM chunks WHERE knowledge_source_id = ?`,
    )
    .bind(knowledgeSourceId)
    .all<{ document_id: string; chunk_index: number }>();

  const vectorIds = await vectorIdsForChunks(
    knowledgeSourceId,
    chunkRows.results ?? [],
  );
  if (vectorIds.length > 0) {
    await removeVectors(vectorize, vectorIds);
  }

  const result = await db
    .prepare("DELETE FROM knowledge_sources WHERE id = ? AND user_id = ?")
    .bind(knowledgeSourceId, ownerUserId)
    .run();

  return result.meta.changes > 0;
}
