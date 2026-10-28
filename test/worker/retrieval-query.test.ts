import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import { loadConfig } from "../../src/config/load-config.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import { retrieve } from "../../src/domain/retrieval/service.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const OTHER_USER = "00000000-0000-4000-8000-000000000011";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "42,43",
      BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
    }),
  });

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM sessions").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedUser(userId: string, githubId: number): Promise<void> {
  await env.DB.prepare(`INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)`)
    .bind(userId, githubId, `user-${githubId}`)
    .run();
}

async function seedReadySource(ownerId: string, sourceId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '12345', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, ownerId)
    .run();

  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'ready')`,
  )
    .bind(sourceId, ownerId, CONNECTION_ID)
    .run();
}

async function insertChunk(content: string): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, ?, '[]')`,
  )
    .bind(SOURCE_ID, content)
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM chunks WHERE knowledge_source_id = ?",
  )
    .bind(SOURCE_ID)
    .first<{ id: number }>();
  return row!.id;
}

describe("hybrid retrieve (worker integration, D1 + mocks)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns RetrievalResponse shape with fused ranks", async () => {
    await seedUser(USER_ID, 42);
    await seedReadySource(USER_ID, SOURCE_ID);
    const chunkRowId = await insertChunk(
      "The permissions model uses can_access for authorization and access control.",
    );

    const cfg = loadConfig(testEnv());
    const voyageFetch = vi.fn(async () =>
      Response.json({
        data: [
          {
            index: 0,
            data: [
              {
                index: 0,
                embedding: Array.from({ length: cfg.embeddingDimensions }, () => 0.02),
              },
            ],
          },
        ],
        model: cfg.voyageModel,
      }),
    );

    const vectorize = {
      query: vi.fn(async () => ({
        matches: [
          {
            id: "vec-1",
            score: 0.9,
            metadata: {
              knowledge_source_id: SOURCE_ID,
              chunk_rowid: chunkRowId,
              document_id: "README.md",
              chunk_index: 0,
            },
          },
        ],
      })),
    } as unknown as VectorizeIndex;

    const result = await retrieve(
      {
        db: env.DB,
        vectorize,
        config: cfg,
        query: "permissions model access control",
        actor: { userId: USER_ID, projectId: null },
        effectiveProjectId: null,
      },
      { voyageFetch },
    );

    expect(result.coverage_sufficient).toBe(true);
    expect(result.expanded).toBe(false);
    expect(result.chunks.length).toBeGreaterThan(0);
    const first = result.chunks[0]!;
    expect(first.chunk_id).toBe(chunkRowId);
    expect(first.knowledge_source_id).toBe(SOURCE_ID);
    expect(first.document_id).toBe("README.md");
    expect(first.chunk_index).toBe(0);
    expect(typeof first.content).toBe("string");
    expect(Array.isArray(first.heading_hierarchy)).toBe(true);
    expect(typeof first.rrf_score).toBe("number");
    expect(first.vector_rank).toBe(1);
    expect(first.keyword_rank).toBe(1);
  });
});

describe("POST /retrieval/query (worker integration)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns empty chunks when actor has no accessible ready sources", async () => {
    await seedUser(USER_ID, 42);
    await seedUser(OTHER_USER, 43);
    await seedReadySource(OTHER_USER, SOURCE_ID);

    const cfg = loadConfig(testEnv());
    const { rawToken } = await createBrowserSession(env.DB, cfg, USER_ID);

    const request = new Request("http://example.com/retrieval/query", {
      method: "POST",
      headers: {
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "anything" }),
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.chunks).toEqual([]);
    expect(body.coverage_sufficient).toBe(false);
    expect(body.coverage_score).toBe(0);
  });
});
