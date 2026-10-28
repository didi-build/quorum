export type ChunkId = number | string;

export interface RankedResult {
  chunkId: ChunkId;
  rank: number;
}

export interface RrfRankMetadata {
  vector_rank: number | null;
  keyword_rank: number | null;
}

export type RrfFusedRow = [ChunkId, number, RrfRankMetadata];

/**
 * Merge ranked result lists with reciprocal rank fusion (v1 parity).
 * Returns tuples of chunk id, score, and per-list rank metadata.
 */
export function reciprocalRankFusion(
  resultLists: RankedResult[][],
  k = 60,
): RrfFusedRow[] {
  const scores = new Map<ChunkId, number>();
  const ranks = new Map<ChunkId, RrfRankMetadata>();

  const listNames = ["vector", "keyword"] as const;

  for (let listIndex = 0; listIndex < resultLists.length; listIndex += 1) {
    const results = resultLists[listIndex] ?? [];
    const name = listNames[listIndex] ?? `list_${listIndex}`;
    for (const item of results) {
      const prior = scores.get(item.chunkId) ?? 0;
      scores.set(item.chunkId, prior + 1.0 / (k + item.rank));

      let meta = ranks.get(item.chunkId);
      if (!meta) {
        meta = { vector_rank: null, keyword_rank: null };
        ranks.set(item.chunkId, meta);
      }
      if (name === "vector") {
        meta.vector_rank = item.rank;
      } else if (name === "keyword") {
        meta.keyword_rank = item.rank;
      }
    }
  }

  const merged = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return merged.map(([chunkId, score]) => [chunkId, score, ranks.get(chunkId)!]);
}
