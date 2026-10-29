import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedDocument } from "../../src/domain/ingestion/adapters/types.js";
import {
  GENERIC_INDEXING_FAILURE_MESSAGE,
  IndexingHttpError,
  RECONNECT_WORKSPACE_MESSAGE,
} from "../../src/domain/ingestion/errors.js";
import { indexKnowledgeSource } from "../../src/domain/ingestion/pipeline.js";
import { loadConfig } from "../../src/config/load-config.js";
import { workerEnvWithSecrets } from "./test-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

const config = loadConfig(workerEnvWithSecrets(env));

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedGithubSource(): Promise<void> {
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
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'pending')`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID)
    .run();
}

describe("indexKnowledgeSource (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("persists chunks and marks the source ready", async () => {
    await seedGithubSource();

    const documents: FetchedDocument[] = [
      {
        document_id: "README.md",
        content: "# Title\n\nHello from integration test.",
      },
      {
        document_id: "docs/adr.md",
        content: "## ADR\n\nArchitecture decisions.",
      },
    ];

    const embeddingDim = config.embeddingDimensions;
    const voyageFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        inputs?: string[][];
        model?: string;
      };
      const groups = body.inputs ?? [];
      const data = groups.map((group, docIndex) => ({
        index: docIndex,
        data: group.map((_, chunkIndex) => ({
          index: chunkIndex,
          embedding: Array.from({ length: embeddingDim }, () => 0.1),
        })),
      }));
      return new Response(JSON.stringify({ data, model: body.model }), { status: 200 });
    });

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents,
          has_more: false,
          files_processed: documents.length,
        }),
        voyageFetch,
        upsertChunkVectors: async () => {},
        clearSourceIndex: async (db, _vectorize, sourceId) => {
          await db
            .prepare(`DELETE FROM chunks WHERE knowledge_source_id = ?`)
            .bind(sourceId)
            .run();
        },
      },
    );

    expect(result.done).toBe(true);

    const source = await env.DB.prepare(
      `SELECT status, status_message, last_indexed_at, indexing_run_id
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        status: string;
        status_message: string | null;
        last_indexed_at: string | null;
        indexing_run_id: string | null;
      }>();

    expect(source?.status).toBe("ready");
    expect(source?.status_message).toBeNull();
    expect(source?.last_indexed_at).not.toBeNull();
    expect(source?.indexing_run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const chunkCount = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();
    expect(chunkCount?.c).toBeGreaterThan(0);

    const ftsCount = await env.DB.prepare(
      `SELECT COUNT(*) AS c
       FROM chunks c
       INNER JOIN chunks_fts f ON c.id = f.rowid
       WHERE c.knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();
    expect(ftsCount?.c).toBe(chunkCount?.c);
  });

  it("sets reconnect message on auth failures", async () => {
    await seedGithubSource();

    await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => {
          throw new IndexingHttpError(401);
        },
      },
    );

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();

    expect(source?.status).toBe("error");
    expect(source?.status_message).toBe(RECONNECT_WORKSPACE_MESSAGE);
  });

  it("rethrows generic fetch errors without marking error", async () => {
    await seedGithubSource();

    await expect(
      indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        { source_id: SOURCE_ID },
        {
          fetchGithubRepoDocuments: async () => {
            throw new Error("provider timeout");
          },
        },
      ),
    ).rejects.toThrow("provider timeout");

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();

    expect(source?.status).toBe("indexing");
    expect(source?.status_message).toBe("Indexing in progress");
  });

  it("marks error on missing GitHub installation id without retrying", async () => {
    await seedGithubSource();
    await env.DB.prepare(`UPDATE connections SET installation_id = NULL WHERE id = ?`)
      .bind(CONNECTION_ID)
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
        },
      ),
    ).resolves.toMatchObject({ done: true });

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();

    expect(source?.status).toBe("error");
    expect(source?.status_message).toBe(GENERIC_INDEXING_FAILURE_MESSAGE);
  });

  it("marks ready with no content message when nothing is indexable", async () => {
    await seedGithubSource();

    await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => ({
          documents: [],
          has_more: false,
          files_processed: 0,
        }),
      },
    );

    const source = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();

    expect(source?.status).toBe("ready");
    expect(source?.status_message).toBe("No indexable content found");
  });
});
