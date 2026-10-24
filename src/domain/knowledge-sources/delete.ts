import {
  deleteChunkVectors,
  type DeleteChunkVectors,
} from "../ingestion/delete-vectors.js";

export type DeleteKnowledgeSourceOptions = {
  deleteChunkVectors?: DeleteChunkVectors;
};

/**
 * Deletes a knowledge source: Vectorize vectors first (by chunk id), then the D1 row
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
    .prepare("SELECT id FROM chunks WHERE knowledge_source_id = ?")
    .bind(knowledgeSourceId)
    .all<{ id: number }>();

  const chunkIds = (chunkRows.results ?? []).map((row) => String(row.id));
  if (chunkIds.length > 0) {
    await removeVectors(vectorize, chunkIds);
  }

  await db
    .prepare("DELETE FROM knowledge_sources WHERE id = ?")
    .bind(knowledgeSourceId)
    .run();
}
