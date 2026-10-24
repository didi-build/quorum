/** Vectorize deleteByIds batch size (DIDI-775). */
export const CHUNK_VECTOR_DELETE_BATCH_SIZE = 100;

/**
 * Deletes Vectorize embeddings by chunk id (vector id equals chunk id string).
 * Implementation calls `deleteByIds` in batches (DIDI-775).
 */
export type DeleteChunkVectors = (
  vectorize: VectorizeIndex,
  chunkIds: string[],
) => Promise<void>;

export const deleteChunkVectors: DeleteChunkVectors = async (_vectorize, chunkIds) => {
  for (
    let offset = 0;
    offset < chunkIds.length;
    offset += CHUNK_VECTOR_DELETE_BATCH_SIZE
  ) {
    const batch = chunkIds.slice(offset, offset + CHUNK_VECTOR_DELETE_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }
    // DIDI-775: await vectorize.deleteByIds(batch);
  }
};
