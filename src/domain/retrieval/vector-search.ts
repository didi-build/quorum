import { loadChunksByIdsInOrder, type ChunkRow } from "./chunk-rows.js";

function vectorizeSourceFilter(
  sourceIds: string[],
): VectorizeVectorMetadataFilter | undefined {
  if (sourceIds.length === 0) {
    return undefined;
  }
  if (sourceIds.length === 1) {
    return { knowledge_source_id: sourceIds[0] };
  }
  return { knowledge_source_id: { $in: sourceIds } };
}

function chunkRowidFromMetadata(
  metadata: Record<string, unknown> | undefined,
): number | null {
  if (!metadata) {
    return null;
  }
  const value = metadata.chunk_rowid;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export async function searchChunksByVector(
  vectorize: VectorizeIndex,
  db: D1Database,
  sourceIds: string[],
  queryEmbedding: number[],
  limit: number,
): Promise<ChunkRow[]> {
  if (sourceIds.length === 0 || limit <= 0) {
    return [];
  }

  const filter = vectorizeSourceFilter(sourceIds);
  const response = await vectorize.query(queryEmbedding, {
    topK: limit,
    returnMetadata: "all",
    ...(filter ? { filter } : {}),
  });

  const rowids: number[] = [];
  for (const match of response.matches ?? []) {
    const rowid = chunkRowidFromMetadata(
      match.metadata as Record<string, unknown> | undefined,
    );
    if (rowid !== null) {
      rowids.push(rowid);
    }
  }

  return loadChunksByIdsInOrder(db, rowids, new Set(sourceIds));
}
