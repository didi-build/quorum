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

  it("marks error when vector delete fails during re-index without dropping D1 first", async () => {
    await seedGithubSource("ready");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await indexKnowledgeSource(
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
    );

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(source?.status).toBe("error");

    const chunk = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ? AND document_id = 'keep.md'`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(chunk).not.toBeNull();
  });

  it("leaves prior chunks intact when Voyage fails on a fresh re-index", async () => {
    await seedGithubSource("ready");
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'keep.md', 0, 'stay', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await indexKnowledgeSource(
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
    );

    const source = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string }>();
    expect(source?.status).toBe("error");

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
    });

    const stale = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(stale).toBeNull();
  });

  it("is idempotent when a continuation message is redelivered", async () => {
    await seedGithubSource("indexing");

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
        { source_id: SOURCE_ID, github_files_processed: 10 },
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
