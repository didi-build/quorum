/**
 * Deletes Vectorize embeddings for a knowledge source (metadata filter `knowledge_source_id`).
 * Full implementation ships with the indexing consumer (DIDI-775).
 */
export type DeleteKnowledgeSourceVectors = (
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
) => Promise<void>;

export const deleteKnowledgeSourceVectors: DeleteKnowledgeSourceVectors = async (
  _vectorize,
  _knowledgeSourceId,
) => {
  // Stub: call Vectorize delete filtered by knowledge_source_id when ingestion lands.
};
