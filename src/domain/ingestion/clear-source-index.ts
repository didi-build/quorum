import { deleteChunkVectors, type DeleteChunkVectors } from "./delete-vectors.js";
import { vectorIdsForChunks } from "./vector-id.js";

export type ClearSourceIndexOptions = {
  deleteChunkVectors?: DeleteChunkVectors;
};

/**
 * Removes all Vectorize vectors and D1 chunks for a knowledge source (vector delete first).
 */
export async function clearSourceIndex(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  options: ClearSourceIndexOptions = {},
): Promise<void> {
  const removeVectors = options.deleteChunkVectors ?? deleteChunkVectors;

  const chunkRows = await db
    .prepare(
      `SELECT document_id, chunk_index FROM chunks WHERE knowledge_source_id = ?`,
    )
    .bind(knowledgeSourceId)
    .all<{ document_id: string; chunk_index: number }>();

  const rows = chunkRows.results ?? [];
  const vectorIds = await vectorIdsForChunks(knowledgeSourceId, rows);
  if (vectorIds.length > 0) {
    await removeVectors(vectorize, vectorIds);
  }

  await db
    .prepare(`DELETE FROM chunks WHERE knowledge_source_id = ?`)
    .bind(knowledgeSourceId)
    .run();
}
