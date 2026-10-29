import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedDocument } from "../../src/domain/ingestion/adapters/types.js";
import { clearSourceIndex } from "../../src/domain/ingestion/clear-source-index.js";
import { chunkText } from "../../src/domain/ingestion/chunking.js";
import {
  indexKnowledgeSource,
  upsertVectors,
} from "../../src/domain/ingestion/pipeline.js";
import { loadConfig } from "../../src/config/load-config.js";
import { workerEnvWithSecrets } from "./test-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

const config = loadConfig(workerEnvWithSecrets(env));

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
});
