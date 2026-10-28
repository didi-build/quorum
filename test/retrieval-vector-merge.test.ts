import { describe, expect, it, vi } from "vitest";
import { searchChunksByVector } from "../src/domain/retrieval/vector-search.js";

function uuidForIndex(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("searchChunksByVector merge across filter groups", () => {
  it("queries every group, merges by descending score, and slices to topK", async () => {
    const sourceIds = Array.from({ length: 62 }, (_, index) => uuidForIndex(index + 1));
    let groupCall = 0;
    const query = vi.fn(async (_embedding, options?: { topK?: number }) => {
      groupCall += 1;
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
            metadata: { chunk_rowid: 20, knowledge_source_id: sourceIds[31] },
          },
        ],
      };
    });

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

    expect(query).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(20);
    expect(rows[0]?.content).toBe("winner");
  });
});
