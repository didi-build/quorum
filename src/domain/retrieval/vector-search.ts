import { loadChunksByIdsInOrder, type ChunkRow } from "./chunk-rows.js";
import { RetrievalUpstreamError } from "./errors.js";

/** Vectorize compact JSON filter must stay under 2048 bytes (Cloudflare docs). */
export const VECTORIZE_FILTER_MAX_BYTES = 2048;

function vectorizeInFilter(sourceIds: string[]): VectorizeVectorMetadataFilter {
  return { knowledge_source_id: { $in: sourceIds } };
}

export function chunkSourceIdsForVectorizeFilter(
  sourceIds: string[],
  maxBytes = VECTORIZE_FILTER_MAX_BYTES,
): string[][] {
  if (sourceIds.length === 0) {
    return [];
  }
  if (sourceIds.length === 1) {
    return [sourceIds];
  }

  const groups: string[][] = [];
  let current: string[] = [];

  for (const id of sourceIds) {
    const candidate = [...current, id];
    const size = JSON.stringify(vectorizeInFilter(candidate)).length;
    if (size > maxBytes && current.length > 0) {
      groups.push(current);
      current = [id];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
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

function compareVectorMatches(a: VectorizeMatch, b: VectorizeMatch): number {
  const scoreA = a.score ?? 0;
  const scoreB = b.score ?? 0;
  return scoreB - scoreA;
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

  const groups = chunkSourceIdsForVectorizeFilter(sourceIds);
  const mergedMatches: VectorizeMatch[] = [];

  try {
    for (const group of groups) {
      const filter =
        group.length === 1
          ? { knowledge_source_id: group[0] }
          : { knowledge_source_id: { $in: group } };

      const response = await vectorize.query(queryEmbedding, {
        topK: limit,
        returnMetadata: "all",
        filter,
      });
      mergedMatches.push(...(response.matches ?? []));
    }
  } catch {
    throw new RetrievalUpstreamError(503);
  }

  mergedMatches.sort(compareVectorMatches);
  const topMatches = mergedMatches.slice(0, limit);

  const rowids: number[] = [];
  for (const match of topMatches) {
    const rowid = chunkRowidFromMetadata(
      match.metadata as Record<string, unknown> | undefined,
    );
    if (rowid !== null) {
      rowids.push(rowid);
    }
  }

  return loadChunksByIdsInOrder(db, rowids, new Set(sourceIds));
}
