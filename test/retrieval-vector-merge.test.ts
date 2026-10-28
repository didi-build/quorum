import { describe, expect, it, vi } from "vitest";
import {
  chunkSourceIdsForVectorizeFilter,
  searchChunksByVector,
} from "../src/domain/retrieval/vector-search.js";

function uuidForIndex(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("searchChunksByVector merge across filter groups", () => {
  it("queries every group, merges by descending score, and slices to topK", async () => {
    const sourceIds = Array.from({ length: 62 }, (_, index) => uuidForIndex(index + 1));
    const expectedGroups = chunkSourceIdsForVectorizeFilter(sourceIds);
    expect(expectedGroups.length).toBeGreaterThan(1);

    let groupCall = 0;
    const capturedFilters: unknown[] = [];
    const query = vi.fn(
      async (_embedding, options?: { topK?: number; filter?: unknown }) => {
        groupCall += 1;
        capturedFilters.push(options?.filter);
        expect(options?.topK).toBe(1);
        if (groupCall === 1) {
          return {
            matches: [
              {
                id: "low",
                score: 0.2,
                metadata: { chunk_rowid: 10, knowledge_source_id: sourceIds[0] },
              },
            ],
          };
        }
        return {
          matches: [
            {
              id: "high",
              score: 0.95,
              metadata: { chunk_rowid: 20, knowledge_source_id: sourceIds[31]! },
            },
          ],
        };
      },
    );

    const db = {
      prepare: () => ({
        bind: (...ids: number[]) => ({
          all: async () => ({
            results: ids.map((id) => ({
              id,
              knowledge_source_id: id === 10 ? sourceIds[0]! : sourceIds[31]!,
              document_id: "d",
              chunk_index: 0,
              content: id === 20 ? "winner" : "loser",
              heading_hierarchy: "[]",
            })),
          }),
        }),
      }),
    } as unknown as D1Database;

    const rows = await searchChunksByVector(
      { query } as unknown as VectorizeIndex,
      db,
      sourceIds,
      [0.5],
      1,
    );

    expect(query).toHaveBeenCalledTimes(expectedGroups.length);
    expect(capturedFilters).toHaveLength(expectedGroups.length);
    for (let index = 0; index < expectedGroups.length; index += 1) {
      const group = expectedGroups[index]!;
      const expectedFilter =
        group.length === 1
          ? { knowledge_source_id: group[0] }
          : { knowledge_source_id: { $in: group } };
      expect(capturedFilters[index]).toEqual(expectedFilter);
    }

    const unionFromFilters = capturedFilters.flatMap((filter) => {
      const record = filter as {
        knowledge_source_id: string | { $in: string[] };
      };
      if (typeof record.knowledge_source_id === "string") {
        return [record.knowledge_source_id];
      }
      return record.knowledge_source_id.$in;
    });
    expect(unionFromFilters.sort()).toEqual([...sourceIds].sort());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(20);
    expect(rows[0]?.content).toBe("winner");
  });
});
