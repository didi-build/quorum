import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedDocument } from "../../src/domain/ingestion/adapters/types.js";
import { clearSourceIndex } from "../../src/domain/ingestion/clear-source-index.js";
import { chunkText } from "../../src/domain/ingestion/chunking.js";
import * as indexingRun from "../../src/domain/ingestion/indexing-run.js";
import { claimIndexingRunOnSource } from "../../src/domain/ingestion/indexing-run.js";
import {
  indexKnowledgeSource,
  upsertVectors,
} from "../../src/domain/ingestion/pipeline.js";
import { loadConfig } from "../../src/config/load-config.js";
import { markKnowledgeSourceQueuedForReindex } from "../../src/domain/db/knowledge-sources.js";
import { workerEnvWithSecrets } from "./test-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

const RUN1 = "00000000-0000-4000-8000-000000000060";
const RUN2 = "00000000-0000-4000-8000-000000000061";

const config = loadConfig(workerEnvWithSecrets(env));

async function seedIndexingWithRun(runId: string, filesCommitted = 0): Promise<void> {
  await seedGithubSource("indexing");
  await env.DB.prepare(
    `UPDATE knowledge_sources
     SET indexing_run_id = ?, indexing_run_files_committed = ?
     WHERE id = ?`,
  )
    .bind(runId, filesCommitted, SOURCE_ID)
    .run();
}

async function supersedeRunInFetch(fromRun: string, toRun: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE knowledge_sources SET status = 'ready' WHERE id = ? AND indexing_run_id = ?`,
  )
    .bind(SOURCE_ID, fromRun)
    .run();
  expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, toRun, fromRun)).toBe(
    "claimed",
  );
  await env.DB.prepare(
    `UPDATE knowledge_sources SET status = 'indexing' WHERE id = ? AND indexing_run_id = ?`,
  )
    .bind(SOURCE_ID, toRun)
    .run();
}

async function expectRunScopedWriteBlocked(
  result: Awaited<ReturnType<typeof indexKnowledgeSource>>,
): Promise<void> {
  expect(result.stale).toBe(true);
  expect(result.continuation).toBeNull();

  const row = await env.DB.prepare(
    `SELECT indexing_run_files_committed, status
     FROM knowledge_sources WHERE id = ?`,
  )
    .bind(SOURCE_ID)
    .first<{ indexing_run_files_committed: number | null; status: string }>();
  expect(row?.indexing_run_files_committed).toBe(0);
  expect(row?.status).not.toBe("ready");
}

function mockVoyageFetch(dim = config.embeddingDimensions) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      inputs?: string[][];
    };
    const groups = body.inputs ?? [];
    const data = groups.map((group, docIndex) => ({
      index: docIndex,
      data: group.map((_, chunkIndex) => ({
        index: chunkIndex,
        embedding: Array.from({ length: dim }, () => 0.1),
      })),
    }));
    return new Response(JSON.stringify({ data, model: config.voyageModel }), {
      status: 200,
    });
  });
}

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedGithubSource(status = "pending"): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'qa-user')`,
  )
    .bind(USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '12345', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', ?)`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID, status)
    .run();
}

describe("indexKnowledgeSource contracts (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("sets indexing status before fetch and clears only after a successful embed", async () => {
    await seedGithubSource();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'old.md', 0, 'old', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    let statusDuringFetch: string | null = null;
    let clearBeforeEmbed = false;
    let embedCompleted = false;

    const documents: FetchedDocument[] = [
      { document_id: "README.md", content: "# Hi\n\nNew content." },
    ];

    const voyageFetch = mockVoyageFetch();

    await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => {
          const row = await env.DB.prepare(
            `SELECT status FROM knowledge_sources WHERE id = ?`,
          )
            .bind(SOURCE_ID)
            .first<{ status: string }>();
          statusDuringFetch = row?.status ?? null;
          return {
            documents,
            has_more: false,
            files_processed: documents.length,
          };
        },
        voyageFetch: async (...args) => {
          const response = await voyageFetch(...args);
          embedCompleted = true;
          return response;
        },
        clearSourceIndex: async (db, vectorize, sourceId, options) => {
          if (!embedCompleted) {
            clearBeforeEmbed = true;
          }
          await clearSourceIndex(db, vectorize, sourceId, {
            ...options,
            deleteChunkVectors: async () => {},
          });
        },
        upsertChunkVectors: async () => {},
      },
    );

    expect(statusDuringFetch).toBe("indexing");
    expect(clearBeforeEmbed).toBe(false);

    const oldChunk = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ? AND document_id = 'old.md'`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(oldChunk).toBeNull();
  });

  it("rethrows when vector delete fails during re-index without dropping D1 first", async () => {
    await seedGithubSource("ready");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await expect(
      indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID },
        {
          fetchGithubRepoDocuments: async () => ({
            documents: [{ document_id: "README.md", content: "hello" }],
            has_more: false,
            files_processed: 1,
          }),
          voyageFetch: mockVoyageFetch(),
          clearSourceIndex: async () => {
            throw new Error("vector delete failed");
          },
          upsertChunkVectors: async () => {},
        },
      ),
    ).rejects.toThrow("vector delete failed");

    const source = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string }>();
    expect(source?.status).toBe("indexing");

    const chunk = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(chunk).not.toBeNull();
  });

  it("rethrows temporary Voyage failures without marking error", async () => {
    await seedGithubSource("ready");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await expect(
      indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID },
        {
          fetchGithubRepoDocuments: async () => ({
            documents: [{ document_id: "README.md", content: "hello world" }],
            has_more: false,
            files_processed: 1,
          }),
          voyageFetch: vi.fn(async () => new Response("fail", { status: 500 })),
        },
      ),
    ).rejects.toMatchObject({ name: "VoyageEmbedError", statusCode: 500 });

    const source = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string }>();
    expect(source?.status).toBe("indexing");

    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("does not clear existing chunks when a continuation batch is empty but more files remain", async () => {
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'prior.md', 0, 'keep-me', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    let clearInvoked = false;

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 40 },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: true,
          files_processed: 90,
        }),
        clearSourceIndex: async () => {
          clearInvoked = true;
        },
      },
    );

    expect(result.done).toBe(false);
    expect(result.continuation).toMatchObject({
      source_id: SOURCE_ID,
      github_files_processed: 90,
    });
    expect(clearInvoked).toBe(false);

    const prior = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'prior.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(prior?.content).toBe("keep-me");
  });

  it("does not clear existing chunks on an empty final continuation batch", async () => {
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'prior-final.md', 0, 'keep-final', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    let clearInvoked = false;

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 120 },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: false,
          files_processed: 120,
        }),
        clearSourceIndex: async () => {
          clearInvoked = true;
        },
      },
    );

    expect(result.done).toBe(true);
    expect(result.continuation).toBeNull();
    expect(clearInvoked).toBe(false);

    const prior = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'prior-final.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(prior?.content).toBe("keep-final");

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(source?.status).toBe("ready");
    expect(source?.status_message).toBeNull();
  });

  it("clears stale chunks on a fresh run when the first batch has no chunks but more files remain", async () => {
    await seedGithubSource("ready");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'stale.md', 0, 'old-index', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: true,
          files_processed: 50,
        }),
        clearSourceIndex: async (db, vectorize, sourceId, options) => {
          await clearSourceIndex(db, vectorize, sourceId, {
            ...options,
            deleteChunkVectors: async () => {},
          });
        },
      },
    );

    expect(result.done).toBe(false);
    expect(result.continuation).toEqual({
      source_id: SOURCE_ID,
      github_files_processed: 50,
      indexing_run_id: expect.any(String),
    });

    const stale = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(stale).toBeNull();
  });

  it("ignores stale fresh-run redelivery without clearing chunks", async () => {
    const staleRunId = "00000000-0000-4000-8000-000000000041";
    const currentRunId = "00000000-0000-4000-8000-000000000042";
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ? WHERE id = ?`,
    )
      .bind(currentRunId, SOURCE_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: staleRunId },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "hello" }],
          has_more: false,
          files_processed: 1,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(result.stale).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();

    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("drops a late first message without run id after progress was committed", async () => {
    const currentRunId = "00000000-0000-4000-8000-000000000044";
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = ?
       WHERE id = ?`,
    )
      .bind(currentRunId, 50, SOURCE_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "hello" }],
          has_more: false,
          files_processed: 1,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(result.stale).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();

    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("drops a late first message without run id after the source is ready again", async () => {
    const finishedRunId = "00000000-0000-4000-8000-000000000045";
    await seedGithubSource("ready");
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ? WHERE id = ?`,
    )
      .bind(finishedRunId, SOURCE_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "hello" }],
          has_more: false,
          files_processed: 1,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(result.stale).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("adopts an in-flight indexing source with no run id yet", async () => {
    await seedGithubSource("indexing");
    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: true,
          files_processed: 25,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(result.stale).not.toBe(true);
    expect(clearSpy).toHaveBeenCalled();

    const source = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
      }>();
    expect(source?.indexing_run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(source?.indexing_run_files_committed).toBe(25);
  });

  it("adopts a deploy-time continuation with no run id and does not clear", async () => {
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 10 },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "hello" }],
          has_more: false,
          files_processed: 11,
        }),
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(result.stale).not.toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();

    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("does not clear on an empty continuation batch when more files remain", async () => {
    const runId = "00000000-0000-4000-8000-000000000046";
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ? WHERE id = ?`,
    )
      .bind(runId, SOURCE_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 40, indexing_run_id: runId },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: true,
          files_processed: 50,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(result.continuation).not.toBeNull();
    expect(clearSpy).not.toHaveBeenCalled();
    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("does not clear on an empty continuation batch that completes the walk", async () => {
    const runId = "00000000-0000-4000-8000-000000000047";
    await seedGithubSource("indexing");
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ? WHERE id = ?`,
    )
      .bind(runId, SOURCE_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    const clearSpy = vi.fn(async () => {});

    await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 40, indexing_run_id: runId },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: false,
          files_processed: 41,
        }),
        clearSourceIndex: clearSpy,
      },
    );

    expect(clearSpy).not.toHaveBeenCalled();
    const chunk = await env.DB.prepare(
      `SELECT content FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first<{ content: string }>();
    expect(chunk?.content).toBe("stay");
  });

  it("QA-1: drops a late first message after a non-empty batch records progress", async () => {
    await seedGithubSource("pending");
    const clearSpy = vi.fn(async () => {});
    const voyageFetch = mockVoyageFetch();
    const documentContent = "# Title\n\n" + "word ".repeat(200);

    const first = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: documentContent }],
          has_more: true,
          files_processed: 25,
        }),
        voyageFetch,
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(first.continuation).not.toBeNull();
    expect(first.continuation?.github_files_processed).toBe(25);

    const afterFirst = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed, status
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
        status: string;
      }>();
    expect(afterFirst?.indexing_run_files_committed).toBe(25);
    expect(afterFirst?.status).toBe("indexing");

    const chunkCountBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();

    clearSpy.mockClear();
    let fetchCalled = false;

    const late = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "should not run" }],
            has_more: false,
            files_processed: 1,
          };
        },
        clearSourceIndex: clearSpy,
      },
    );

    expect(late.stale).toBe(true);
    expect(late.continuation).toBeNull();
    expect(fetchCalled).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();

    const afterLate = await env.DB.prepare(
      `SELECT indexing_run_files_committed, status
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_files_committed: number | null;
        status: string;
      }>();
    expect(afterLate?.indexing_run_files_committed).toBe(25);
    expect(afterLate?.status).toBe("indexing");

    const chunkCountAfter = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();
    expect(chunkCountAfter?.c).toBe(chunkCountBefore?.c);
  });

  it("QA-3 pipeline: a lost claim race returns stale without fetching", async () => {
    await seedGithubSource("pending");
    const claimSpy = vi
      .spyOn(indexingRun, "claimIndexingRunOnSource")
      .mockResolvedValue("lost_race");

    let fetchCalled = false;
    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return { documents: [], has_more: false, files_processed: 0 };
        },
      },
    );

    expect(result.stale).toBe(true);
    expect(fetchCalled).toBe(false);
    expect(claimSpy.mock.calls.length).toBe(2);

    claimSpy.mockRestore();
  });

  it("drops a continuation with no run id when the source is ready and run id is null", async () => {
    await seedGithubSource("ready");
    let fetchCalled = false;

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 12 },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return { documents: [], has_more: false, files_processed: 12 };
        },
      },
    );

    expect(result.stale).toBe(true);
    expect(result.continuation).toBeNull();
    expect(fetchCalled).toBe(false);
  });

  it("drops a continuation with no run id when the source is pending and run id is null", async () => {
    await seedGithubSource("pending");
    let fetchCalled = false;

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 3 },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return { documents: [], has_more: false, files_processed: 3 };
        },
      },
    );

    expect(result.stale).toBe(true);
    expect(fetchCalled).toBe(false);
  });

  it("run-scoped writes: stale when progress cannot commit after run superseded in fetch (more files, with chunks)", async () => {
    await seedIndexingWithRun(RUN1);
    const voyageFetch = mockVoyageFetch();
    const documentContent = "# Title\n\n" + "word ".repeat(200);

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 10,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          await supersedeRunInFetch(RUN1, RUN2);
          return {
            documents: [{ document_id: "README.md", content: documentContent }],
            has_more: true,
            files_processed: 25,
          };
        },
        voyageFetch,
        upsertChunkVectors: async () => {},
      },
    );

    await expectRunScopedWriteBlocked(result);
  });

  it("run-scoped writes: stale when ready cannot commit after run superseded in fetch (final batch, with chunks)", async () => {
    await seedIndexingWithRun(RUN1);
    const voyageFetch = mockVoyageFetch();

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 10,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          await supersedeRunInFetch(RUN1, RUN2);
          return {
            documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
            has_more: false,
            files_processed: 11,
          };
        },
        voyageFetch,
        upsertChunkVectors: async () => {},
      },
    );

    await expectRunScopedWriteBlocked(result);
  });

  it("run-scoped writes: stale when progress cannot commit after run superseded in fetch (more files, empty batch)", async () => {
    await seedIndexingWithRun(RUN1);

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 10,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          await supersedeRunInFetch(RUN1, RUN2);
          return { documents: [], has_more: true, files_processed: 30 };
        },
      },
    );

    await expectRunScopedWriteBlocked(result);
  });

  it("run-scoped writes: stale when ready cannot commit after run superseded in fetch (final batch, empty)", async () => {
    await seedIndexingWithRun(RUN1);

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 10,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          await supersedeRunInFetch(RUN1, RUN2);
          return { documents: [], has_more: false, files_processed: 11 };
        },
      },
    );

    await expectRunScopedWriteBlocked(result);
  });

  it("run-scoped writes: stale when indexing status cannot start after the run is superseded during claim", async () => {
    await seedGithubSource("pending");
    const originalClaim = indexingRun.claimIndexingRunOnSource;
    const claimSpy = vi
      .spyOn(indexingRun, "claimIndexingRunOnSource")
      .mockImplementation(async (db, sourceId, runId, expectedCurrentRunId) => {
        const outcome = await originalClaim(db, sourceId, runId, expectedCurrentRunId);
        if (outcome === "claimed" && runId === RUN1) {
          await supersedeRunInFetch(RUN1, RUN2);
        }
        return outcome;
      });

    let fetchCalled = false;
    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: RUN1 },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return {
            documents: [],
            has_more: false,
            files_processed: 0,
          };
        },
      },
    );

    claimSpy.mockRestore();
    expect(result.stale).toBe(true);
    expect(result.continuation).toBeNull();
    expect(fetchCalled).toBe(false);

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(row?.indexing_run_id).toBe(RUN2);
    expect(row?.status).not.toBe("ready");
  });

  it("is idempotent when a continuation message is redelivered", async () => {
    await seedGithubSource("indexing");
    const runId = "00000000-0000-4000-8000-000000000043";
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ? WHERE id = ?`,
    )
      .bind(runId, SOURCE_ID)
      .run();

    const voyageFetch = mockVoyageFetch();

    const documents: FetchedDocument[] = [
      { document_id: "README.md", content: "# Title\n\nHello again." },
    ];

    const expectedChunks = chunkText(
      documents[0].document_id,
      documents[0].content,
      config,
    ).length;

    const run = async () =>
      indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID, github_files_processed: 10, indexing_run_id: runId },
        {
          fetchGithubRepoDocuments: async () => ({
            documents,
            has_more: false,
            files_processed: 11,
          }),
          voyageFetch,
          upsertChunkVectors: async (_vectorize, sourceId, rows) => {
            await upsertVectors(
              { upsert: async () => undefined } as unknown as VectorizeIndex,
              sourceId,
              rows,
            );
          },
        },
      );

    await run();
    await expect(run()).resolves.toMatchObject({ done: true });

    const source = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string }>();
    expect(source?.status).toBe("ready");

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();
    expect(count?.c).toBe(expectedChunks);
  });

  async function completeGithubIndexInOneBatch(
    message: Parameters<typeof indexKnowledgeSource>[3],
  ): Promise<Awaited<ReturnType<typeof indexKnowledgeSource>>> {
    return indexKnowledgeSource(env.DB, env.VECTORIZE, config, message, {
      fetchGithubRepoDocuments: async () => ({
        documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
        has_more: false,
        files_processed: 1,
      }),
      voyageFetch: mockVoyageFetch(),
      upsertChunkVectors: async () => {},
    });
  }

  it("DIDI-980: refresh completes when the prior run final leg is processed first", async () => {
    await seedIndexingWithRun(RUN1, 25);

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const refreshRunId = queued!.indexingRunId;

    let oldLegFetchCalled = false;
    const oldFinal = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 25,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          oldLegFetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "stale" }],
            has_more: false,
            files_processed: 26,
          };
        },
        voyageFetch: mockVoyageFetch(),
        upsertChunkVectors: async () => {},
      },
    );

    expect(oldFinal.stale).toBe(true);
    expect(oldLegFetchCalled).toBe(false);

    const afterOldLeg = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(afterOldLeg?.indexing_run_id).toBe(refreshRunId);
    expect(afterOldLeg?.status).toBe("pending");

    const refreshResult = await completeGithubIndexInOneBatch({
      source_id: SOURCE_ID,
      indexing_run_id: refreshRunId,
    });
    expect(refreshResult.stale).not.toBe(true);
    expect(refreshResult.continuation).toBeNull();

    const afterRefresh = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(afterRefresh?.indexing_run_id).toBe(refreshRunId);
    expect(afterRefresh?.status).toBe("ready");
  });

  it("DIDI-980: refresh completes when its first message arrives before the prior final leg", async () => {
    await seedIndexingWithRun(RUN1, 25);

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const refreshRunId = queued!.indexingRunId;

    const refreshResult = await completeGithubIndexInOneBatch({
      source_id: SOURCE_ID,
      indexing_run_id: refreshRunId,
    });
    expect(refreshResult.stale).not.toBe(true);

    let oldLegFetchCalled = false;
    const oldFinal = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        github_files_processed: 25,
        indexing_run_id: RUN1,
      },
      {
        fetchGithubRepoDocuments: async () => {
          oldLegFetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "stale" }],
            has_more: false,
            files_processed: 26,
          };
        },
      },
    );

    expect(oldFinal.stale).toBe(true);
    expect(oldLegFetchCalled).toBe(false);

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(row?.indexing_run_id).toBe(refreshRunId);
    expect(row?.status).toBe("ready");
  });

  it("DIDI-980: legacy source_id-only first message still indexes on pending", async () => {
    await seedGithubSource("pending");

    const result = await completeGithubIndexInOneBatch({ source_id: SOURCE_ID });

    expect(result.stale).not.toBe(true);
    const row = await env.DB.prepare(
      `SELECT status, indexing_run_id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; indexing_run_id: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.indexing_run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("drops a redelivered refresh first message after the run is ready without re-clearing", async () => {
    await seedGithubSource("ready");
    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const runId = queued!.indexingRunId;

    await completeGithubIndexInOneBatch({
      source_id: SOURCE_ID,
      indexing_run_id: runId,
    });

    const clearSpy = vi.fn(async () => {});
    let fetchCalled = false;

    const duplicate = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runId },
      {
        fetchGithubRepoDocuments: async () => {
          fetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "again" }],
            has_more: false,
            files_processed: 1,
          };
        },
        clearSourceIndex: clearSpy,
      },
    );

    expect(duplicate.stale).toBe(true);
    expect(fetchCalled).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("drops a redelivered refresh first message mid-run at progress 25 without clearing or forking", async () => {
    await seedGithubSource("pending");
    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const runId = queued!.indexingRunId;

    const clearSpy = vi.fn(async () => {});
    const documentContent = "# Title\n\n" + "word ".repeat(200);

    const first = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runId },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: documentContent }],
          has_more: true,
          files_processed: 25,
        }),
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(first.stale).not.toBe(true);
    expect(first.continuation?.indexing_run_id).toBe(runId);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockClear();

    let redeliveryFetchCalled = false;
    const redelivery = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runId },
      {
        fetchGithubRepoDocuments: async () => {
          redeliveryFetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "fork" }],
            has_more: false,
            files_processed: 1,
          };
        },
        clearSourceIndex: clearSpy,
      },
    );

    expect(redelivery.stale).toBe(true);
    expect(redelivery.continuation).toBeNull();
    expect(redeliveryFetchCalled).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();

    const row = await env.DB.prepare(
      `SELECT indexing_run_files_committed, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_files_committed: number | null; status: string }>();
    expect(row?.indexing_run_files_committed).toBe(25);
    expect(row?.status).toBe("indexing");
  });

  it("double refresh clears the index once and the latest run reaches ready", async () => {
    await seedGithubSource("ready");
    const firstRefresh = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    const runB = firstRefresh!.indexingRunId;
    const secondRefresh = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    const runC = secondRefresh!.indexingRunId;

    const clearSpy = vi.fn(async () => {});

    const staleB = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runB },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "stale b" }],
          has_more: false,
          files_processed: 1,
        }),
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );
    expect(staleB.stale).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();

    const runCResult = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runC },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
          has_more: false,
          files_processed: 1,
        }),
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(runCResult.stale).not.toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(row?.indexing_run_id).toBe(runC);
    expect(row?.status).toBe("ready");
  });

  it("refresh at progress 25 drops a run-id-less final continuation then B indexes with one clear", async () => {
    await seedIndexingWithRun(RUN1, 25);

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const runB = queued!.indexingRunId;

    const clearSpy = vi.fn(async () => {});
    let strayFetchCalled = false;

    const stray = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, github_files_processed: 25 },
      {
        fetchGithubRepoDocuments: async () => {
          strayFetchCalled = true;
          return {
            documents: [{ document_id: "README.md", content: "stray final" }],
            has_more: false,
            files_processed: 26,
          };
        },
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(stray.stale).toBe(true);
    expect(strayFetchCalled).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();

    const afterStray = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(afterStray?.indexing_run_id).toBe(runB);
    expect(afterStray?.status).toBe("pending");

    const firstB = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runB },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
          has_more: false,
          files_processed: 1,
        }),
        voyageFetch: mockVoyageFetch(),
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(firstB.stale).not.toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const afterB = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(afterB?.indexing_run_id).toBe(runB);
    expect(afterB?.status).toBe("ready");
  });

  it("refresh first leg retries after a transient Voyage 503 and reaches ready under run B", async () => {
    await seedGithubSource("ready");
    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      SOURCE_ID,
      USER_ID,
    );
    expect(queued).not.toBeNull();
    const runB = queued!.indexingRunId;

    const clearSpy = vi.fn(async () => {});
    const baseVoyageFetch = mockVoyageFetch();
    let voyageCalls = 0;

    const voyageFetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
      voyageCalls++;
      if (voyageCalls === 1) {
        return new Response("fail", { status: 503 });
      }
      return baseVoyageFetch(...args);
    });

    await expect(
      indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID, indexing_run_id: runB },
        {
          fetchGithubRepoDocuments: async () => ({
            documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
            has_more: false,
            files_processed: 1,
          }),
          voyageFetch,
          clearSourceIndex: clearSpy,
          upsertChunkVectors: async () => {},
        },
      ),
    ).rejects.toMatchObject({ name: "VoyageEmbedError", statusCode: 503 });

    expect(clearSpy).not.toHaveBeenCalled();

    const afterFailure = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed, status
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string;
        indexing_run_files_committed: number | null;
        status: string;
      }>();
    expect(afterFailure?.indexing_run_id).toBe(runB);
    expect(afterFailure?.indexing_run_files_committed).toBe(0);
    expect(afterFailure?.status).toBe("indexing");

    const retry = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID, indexing_run_id: runB },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
          has_more: false,
          files_processed: 1,
        }),
        voyageFetch,
        clearSourceIndex: clearSpy,
        upsertChunkVectors: async () => {},
      },
    );

    expect(retry.stale).not.toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const afterRetry = await env.DB.prepare(
      `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string; status: string }>();
    expect(afterRetry?.indexing_run_id).toBe(runB);
    expect(afterRetry?.status).toBe("ready");
  });

  it.each([
    ["ready", "ready"],
    ["error", "error"],
    ["pending", "pending"],
  ] as const)(
    "refresh from %s status clears the index exactly once on the first message",
    async (seedStatus, _label) => {
      await seedGithubSource(seedStatus);
      await env.DB.prepare(
        `UPDATE knowledge_sources
         SET indexing_run_id = ?, indexing_run_files_committed = 40
         WHERE id = ?`,
      )
        .bind(RUN1, SOURCE_ID)
        .run();

      const queued = await markKnowledgeSourceQueuedForReindex(
        env.DB,
        SOURCE_ID,
        USER_ID,
      );
      expect(queued).not.toBeNull();
      const runId = queued!.indexingRunId;

      const clearSpy = vi.fn(async () => {});

      const result = await indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID, indexing_run_id: runId },
        {
          fetchGithubRepoDocuments: async () => ({
            documents: [{ document_id: "README.md", content: "# Title\n\nHello." }],
            has_more: false,
            files_processed: 1,
          }),
          voyageFetch: mockVoyageFetch(),
          clearSourceIndex: clearSpy,
          upsertChunkVectors: async () => {},
        },
      );

      expect(result.stale).not.toBe(true);
      expect(clearSpy).toHaveBeenCalledTimes(1);

      const row = await env.DB.prepare(
        `SELECT indexing_run_id, status FROM knowledge_sources WHERE id = ?`,
      )
        .bind(SOURCE_ID)
        .first<{ indexing_run_id: string; status: string }>();
      expect(row?.indexing_run_id).toBe(runId);
      expect(row?.status).toBe("ready");
    },
  );
});
