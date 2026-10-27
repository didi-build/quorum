export function chunkVectorId(
  knowledgeSourceId: string,
  documentId: string,
  chunkIndex: number,
): string {
  return `${knowledgeSourceId}:${documentId}:${chunkIndex}`;
}

export function vectorIdsForChunks(
  knowledgeSourceId: string,
  rows: ReadonlyArray<{ document_id: string; chunk_index: number }>,
): string[] {
  return rows.map((row) =>
    chunkVectorId(knowledgeSourceId, row.document_id, row.chunk_index),
  );
}
