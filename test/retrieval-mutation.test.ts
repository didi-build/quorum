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
const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const SOURCE_READY = "00000000-0000-4000-8000-000000000030";

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
        bind: () => ({
          all: async () => ({ results: [{ id: SOURCE_READY }] }),
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
        effectiveProjectId: null,
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
    expect(fusionSpy.mock.calls[0]?.[1]).toBe(42);
    fusionSpy.mockRestore();
  });

  it("runs vector and keyword search in parallel", async () => {
    const chunk: ChunkRow = {
      id: 2,
      knowledge_source_id: SOURCE_READY,
      document_id: "doc.md",
      chunk_index: 0,
      content: "permissions model access control can_access",
      heading_hierarchy: [],
    };

    let releaseKeyword!: () => void;
    const keywordGate = new Promise<void>((resolve) => {
      releaseKeyword = resolve;
    });
    let keywordRanWhileVectorBlocked = false;

    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [{ id: SOURCE_READY }] }),
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
        effectiveProjectId: null,
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
          await keywordGate;
          return [chunk];
        },
        searchKeyword: async () => {
          keywordRanWhileVectorBlocked = true;
          releaseKeyword();
          return [chunk];
        },
      },
    );

    expect(keywordRanWhileVectorBlocked).toBe(true);
  });

  it("caps coverage expansion at literal 50", () => {
    expect(RETRIEVAL_EXPANSION_CAP).toBe(50);
    const limit = 30;
    const expandedLimit = Math.min(limit * 2, RETRIEVAL_EXPANSION_CAP);
    expect(expandedLimit).toBe(50);
  });

  it("filters ready sources in SQL with can_access rules", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (userId: string, projectId: string | null) => ({
          all: async () => {
            expect(sql).toContain("status = 'ready'");
            expect(sql).toContain("user_id IS NULL AND project_id IS NULL");
            expect(userId).toBe(USER_A);
            expect(projectId).toBe(PROJECT_A);
            return {
              results: [{ id: SOURCE_READY }],
            };
          },
        }),
      }),
    } as unknown as D1Database;

    const ids = await accessibleReadySourceIds(db, USER_A, PROJECT_A);
    expect(ids).toEqual([SOURCE_READY]);
  });

  it("returns empty retrieval when no accessible ready sources", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database;

    const result = await retrieve(
      {
        db,
        vectorize: {} as VectorizeIndex,
        config,
        query: "anything",
        actor: actorContext(USER_A, null),
        effectiveProjectId: null,
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
