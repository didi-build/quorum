import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import { retrieve, RETRIEVAL_EXPANSION_CAP } from "../src/domain/retrieval/service.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv({ COVERAGE_MIN_SCORE: "0.99" }));
const USER = "00000000-0000-4000-8000-000000000010";
const SOURCE = "00000000-0000-4000-8000-000000000030";

function mockDb(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [{ id: SOURCE }] }),
      }),
    }),
  } as unknown as D1Database;
}

describe("coverage expansion (unit)", () => {
  it("doubles top_k up to 50 and sets expanded", async () => {
    const searchVector = vi.fn(async (_v, _db, _ids, _emb, limit: number) => {
      if (limit === 30) {
        return [
          {
            id: 1,
            knowledge_source_id: SOURCE,
            document_id: "d",
            chunk_index: 0,
            content: "unrelated text",
            heading_hierarchy: [],
          },
        ];
      }
      expect(limit).toBe(50);
      return [
        {
          id: 1,
          knowledge_source_id: SOURCE,
          document_id: "d",
          chunk_index: 0,
          content: "kubernetes deployment terraform details",
          heading_hierarchy: [],
        },
      ];
    });
    const searchKeyword = vi.fn(async (_db, _ids, _q, limit: number) => {
      if (limit === 30) {
        return [];
      }
      expect(limit).toBe(50);
      return [];
    });

    const result = await retrieve(
      {
        db: mockDb(),
        vectorize: {} as VectorizeIndex,
        config,
        query: "kubernetes deployment terraform",
        actor: actorContext(USER, null),
        effectiveProjectId: null,
        topK: 30,
      },
      {
        voyageFetch: async () =>
          Response.json({
            data: [
              {
                index: 0,
                data: [
                  {
                    index: 0,
                    embedding: Array.from(
                      { length: config.embeddingDimensions },
                      () => 0,
                    ),
                  },
                ],
              },
            ],
            model: "v",
          }),
        searchVector,
        searchKeyword,
      },
    );

    expect(result.expanded).toBe(true);
    expect(searchVector).toHaveBeenCalledTimes(2);
    expect(result.chunks.length).toBeLessThanOrEqual(30);
    expect(RETRIEVAL_EXPANSION_CAP).toBe(50);
  });
});
