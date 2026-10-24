import { deleteKnowledgeSourceVectors } from "../ingestion/delete-vectors.js";

/**
 * Deletes a knowledge source, its D1 chunks (and FTS rows via triggers), and Vectorize vectors.
 */
export async function deleteKnowledgeSource(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
): Promise<void> {
  await deleteKnowledgeSourceVectors(vectorize, knowledgeSourceId);
  await db
    .prepare("DELETE FROM knowledge_sources WHERE id = ?")
    .bind(knowledgeSourceId)
    .run();
}
