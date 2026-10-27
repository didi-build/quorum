/** Vectorize deleteByIds batch size (DIDI-775). */
export const CHUNK_VECTOR_DELETE_BATCH_SIZE = 100;

export type DeleteChunkVectors = (
  vectorize: VectorizeIndex,
  vectorIds: string[],
) => Promise<void>;

export const deleteChunkVectors: DeleteChunkVectors = async (vectorize, vectorIds) => {
  for (
    let offset = 0;
    offset < vectorIds.length;
    offset += CHUNK_VECTOR_DELETE_BATCH_SIZE
  ) {
    const batch = vectorIds.slice(offset, offset + CHUNK_VECTOR_DELETE_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }
    await vectorize.deleteByIds(batch);
  }
};
