import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import { loadChunksByIdsInOrder } from "../src/domain/retrieval/chunk-rows.js";
import { retrieve } from "../src/domain/retrieval/service.js";
import { searchChunksByVector } from "../src/domain/retrieval/vector-search.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv({ RRF_K: "60" }));
const USER_A = "00000000-0000-4000-8000-000000000010";
const SOURCE_A = "00000000-0000-4000-8000-000000000030";
const SOURCE_B = "00000000-0000-4000-8000-000000000031";

describe("loadChunksByIdsInOrder post-filter (unit)", () => {
  it("drops rowids that belong to disallowed sources", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              {
                id: 9,
                knowledge_source_id: SOURCE_B,
                document_id: "d",
                chunk_index: 0,
                content: "secret",
                heading_hierarchy: "[]",
              },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;

    const rows = await loadChunksByIdsInOrder(db, [9], new Set([SOURCE_A]));
    expect(rows).toEqual([]);
  });
});

describe("searchChunksByVector filter usage (unit)", () => {
  it("passes a knowledge_source_id filter to vectorize.query", async () => {
    const query = vi.fn(async () => ({ matches: [] }));
    const vectorize = { query } as unknown as VectorizeIndex;
    await searchChunksByVector(
      vectorize,
      {} as D1Database,
      [SOURCE_A, SOURCE_B],
      [0.2],
      4,
    );
    expect(query).toHaveBeenCalled();
    const calls = query.mock.calls as unknown[][];
    const options = calls[0]?.[1] as { filter?: unknown } | undefined;
    expect(options?.filter).toBeDefined();
  });
});

describe("retrieve cross-tenant guards (unit, mocked search)", () => {
  it("does not return chunks from a non-accessible source id", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          all: async () => {
            expect(sql).toContain("status = 'ready'");
            return { results: [{ id: SOURCE_A }] };
          },
        }),
      }),
    } as unknown as D1Database;

    const searchVector = vi.fn(async () => [
      {
        id: 1,
        knowledge_source_id: SOURCE_B,
        document_id: "d",
        chunk_index: 0,
        content: "leaked",
        heading_hierarchy: [],
      },
    ]);
    const searchKeyword = vi.fn(async () => []);

    const result = await retrieve(
      {
        db,
        vectorize: {} as VectorizeIndex,
        config,
        query: "alpha beta gamma",
        actor: actorContext(USER_A, null),
        effectiveProjectId: null,
        topK: 5,
      },
      {
        voyageFetch: async () =>
          Response.json({
            data: [{ index: 0, data: [{ index: 0, embedding: [0.1] }] }],
            model: "v",
          }),
        searchVector,
        searchKeyword,
      },
    );

    expect(result.chunks).toEqual([]);
  });
});
