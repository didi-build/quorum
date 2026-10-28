import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";
import {
  accessibleReadySourceIds,
  retrieve,
  RETRIEVAL_EXPANSION_CAP,
} from "../src/domain/retrieval/service.js";
import { reciprocalRankFusion } from "../src/domain/retrieval/rrf.js";
import * as rrfModule from "../src/domain/retrieval/rrf.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type { ChunkRow } from "../src/domain/retrieval/chunk-rows.js";

const config = loadConfig(withTestConfigEnv({ RRF_K: "42" }));

const USER_A = "00000000-0000-4000-8000-000000000010";
const USER_B = "00000000-0000-4000-8000-000000000011";
const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const SOURCE_READY = "00000000-0000-4000-8000-000000000030";
const SOURCE_INDEXING = "00000000-0000-4000-8000-000000000031";
const SOURCE_OTHER_USER = "00000000-0000-4000-8000-000000000032";

function mockDb(allRows: KnowledgeSourceRow[]): D1Database {
  return {
    prepare: () => ({
      all: async () => ({ results: allRows }),
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

interface KnowledgeSourceRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
}

describe("retrieval mutation guards (DIDI-778)", () => {
  it("passes config rrfK into reciprocalRankFusion during retrieve", async () => {
    const fusionSpy = vi.spyOn(rrfModule, "reciprocalRankFusion");

    const chunk: ChunkRow = {
      id: 1,
      knowledge_source_id: SOURCE_READY,
      document_id: "doc.md",
      chunk_index: 0,
      content: "permissions model access control can_access",
      heading_hierarchy: [],
    };

    const db = {
      prepare: () => ({
        all: async () => ({
          results: [{ id: SOURCE_READY, user_id: USER_A, project_id: null }],
        }),
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;

    await retrieve(
      {
        db,
        vectorize: {} as VectorizeIndex,
        config,
        query: "permissions model access control",
        actor: actorContext(USER_A, null),
        topK: 5,
      },
      {
        voyageFetch: async () =>
          new Response(
            JSON.stringify({
              data: [{ index: 0, data: [{ index: 0, embedding: [0.1] }] }],
              model: "voyage-context-4",
            }),
            { status: 200 },
          ),
        searchVector: async () => [chunk],
        searchKeyword: async () => [chunk],
      },
    );

    expect(fusionSpy).toHaveBeenCalled();
    const call = fusionSpy.mock.calls[0];
    expect(call?.[1]).toBe(42);
    fusionSpy.mockRestore();
  });

  it("runs vector and keyword search in parallel", async () => {
    let vectorStarted = false;
    let keywordStarted = false;
    let parallel = false;

    const chunk: ChunkRow = {
      id: 2,
      knowledge_source_id: SOURCE_READY,
      document_id: "doc.md",
      chunk_index: 0,
      content: "permissions model access control can_access",
      heading_hierarchy: [],
    };

    await retrieve(
      {
        db: {
          prepare: () => ({
            all: async () => ({
              results: [{ id: SOURCE_READY, user_id: USER_A, project_id: null }],
            }),
            bind: () => ({
              first: async () => null,
            }),
          }),
        } as unknown as D1Database,
        vectorize: {} as VectorizeIndex,
        config,
        query: "permissions model access control",
        actor: actorContext(USER_A, null),
        topK: 5,
      },
      {
        voyageFetch: async () =>
          new Response(
            JSON.stringify({
              data: [{ index: 0, data: [{ index: 0, embedding: [0.1] }] }],
              model: "voyage-context-4",
            }),
            { status: 200 },
          ),
        searchVector: async () => {
          vectorStarted = true;
          parallel = keywordStarted;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return [chunk];
        },
        searchKeyword: async () => {
          keywordStarted = true;
          parallel = vectorStarted;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return [chunk];
        },
      },
    );

    expect(vectorStarted).toBe(true);
    expect(keywordStarted).toBe(true);
    expect(parallel).toBe(true);
  });

  it("caps coverage expansion at literal 50", () => {
    expect(RETRIEVAL_EXPANSION_CAP).toBe(50);
    const limit = 30;
    const expandedLimit = Math.min(limit * 2, RETRIEVAL_EXPANSION_CAP);
    expect(expandedLimit).toBe(50);
  });

  it("filters ready sources with can_access", async () => {
    const rows: KnowledgeSourceRow[] = [
      { id: SOURCE_READY, user_id: USER_A, project_id: null },
      { id: SOURCE_INDEXING, user_id: USER_A, project_id: null },
      { id: SOURCE_OTHER_USER, user_id: USER_B, project_id: null },
      { id: "global", user_id: null, project_id: null },
    ];

    const db = {
      prepare: (sql: string) => ({
        all: async () => {
          expect(sql).toContain("status = 'ready'");
          return { results: rows.filter((row) => row.id !== SOURCE_INDEXING) };
        },
      }),
    } as unknown as D1Database;

    const ids = await accessibleReadySourceIds(
      db,
      actorContext(USER_A, PROJECT_A),
      PROJECT_A,
    );
    expect(ids).toEqual([SOURCE_READY, "global"]);
  });

  it("returns empty retrieval when no accessible ready sources", async () => {
    const db = mockDb([]);

    const result = await retrieve(
      {
        db,
        vectorize: {} as VectorizeIndex,
        config,
        query: "anything",
        actor: actorContext(USER_A, null),
      },
      {
        searchVector: vi.fn(),
        searchKeyword: vi.fn(),
      },
    );

    expect(result.chunks).toEqual([]);
    expect(result.coverage_sufficient).toBe(false);
    expect(result.coverage_score).toBe(0);
  });
});

describe("reciprocalRankFusion k parameter", () => {
  it("uses supplied k in score denominator", () => {
    const chunkA = "a";
    const mergedDefault = reciprocalRankFusion([[{ chunkId: chunkA, rank: 1 }]], 60);
    const mergedSmallK = reciprocalRankFusion([[{ chunkId: chunkA, rank: 1 }]], 10);
    expect(mergedSmallK[0]?.[1]).toBeGreaterThan(mergedDefault[0]?.[1] ?? 0);
  });
});
