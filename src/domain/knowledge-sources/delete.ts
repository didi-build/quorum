import {
  deleteChunkVectors,
  type DeleteChunkVectors,
} from "../ingestion/delete-vectors.js";
import { vectorIdsForChunks } from "../ingestion/vector-id.js";

export type DeleteKnowledgeSourceOptions = {
  deleteChunkVectors?: DeleteChunkVectors;
};

/**
 * Deletes a knowledge source: Vectorize vectors first (hashed namespaced ids), then the D1 row
 * (chunks and FTS rows cascade). Vector-first ordering allows retry if Vectorize fails.
 */
export async function deleteKnowledgeSource(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  options: DeleteKnowledgeSourceOptions = {},
): Promise<void> {
  const removeVectors = options.deleteChunkVectors ?? deleteChunkVectors;

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

  await db
    .prepare("DELETE FROM knowledge_sources WHERE id = ?")
    .bind(knowledgeSourceId)
    .run();
}
