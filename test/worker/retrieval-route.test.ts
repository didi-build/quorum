import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import {
  hashApiKey,
  resetBootstrapApiKeyGuard,
} from "../../src/domain/auth/api-key.js";
import { loadConfig } from "../../src/config/load-config.js";
import { RETRIEVAL_QUERY_MAX_LENGTH } from "../../src/domain/retrieval/query-limits.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_P = "00000000-0000-4000-8000-000000000030";
const SOURCE_Q = "00000000-0000-4000-8000-000000000031";
const API_KEY = "retrieval-scoped-test-key";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "42",
      BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
    }),
  });

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM api_keys").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedProjectSource(
  sourceId: string,
  projectId: string,
  content: string,
): Promise<number> {
  await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, 42, 'u')")
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
        id, user_id, project_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'ready')`,
  )
    .bind(sourceId, USER_ID, projectId, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, ?, '[]')`,
  )
    .bind(sourceId, content)
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM chunks WHERE knowledge_source_id = ?",
  )
    .bind(sourceId)
    .first<{ id: number }>();
  return row!.id;
}

async function ensureUser(): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 42, 'retrieval-user')",
  )
    .bind(USER_ID)
    .run();
}

async function seedScopedApiKey(projectId: string): Promise<void> {
  await ensureUser();
  const keyHash = await hashApiKey(API_KEY);
  await env.DB.prepare(
    "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), keyHash, USER_ID, projectId)
    .run();
}

describe("POST /retrieval/query route guards (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await clearData();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hello" }),
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("returns 400 when top_k is 51", async () => {
    await seedScopedApiKey(PROJECT_P);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ query: "hello", top_k: 51 }),
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it("returns 400 when query exceeds max length", async () => {
    await seedScopedApiKey(PROJECT_P);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ query: "x".repeat(RETRIEVAL_QUERY_MAX_LENGTH + 1) }),
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it("returns 404 when a P-scoped API key sends project_id Q", async () => {
    await seedProjectSource(SOURCE_P, PROJECT_P, "permissions model access control");
    await seedScopedApiKey(PROJECT_P);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({
          query: "permissions model access control",
          project_id: PROJECT_Q,
        }),
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it("returns 200 for a P-scoped API key with matching project_id", async () => {
    await clearData();
    await seedProjectSource(
      SOURCE_P,
      PROJECT_P,
      "permissions model access control text",
    );
    await seedScopedApiKey(PROJECT_P);
    const cfg = loadConfig(testEnv());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              index: 0,
              data: [
                {
                  index: 0,
                  embedding: Array.from(
                    { length: cfg.embeddingDimensions },
                    () => 0.02,
                  ),
                },
              ],
            },
          ],
          model: cfg.voyageModel,
        }),
      ),
    );

    const bindings = {
      ...testEnv(),
      VECTORIZE: {
        query: vi.fn(async () => ({ matches: [] })),
      } as unknown as VectorizeIndex,
    };

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({
          query: "permissions model access control",
          project_id: PROJECT_P,
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    vi.unstubAllGlobals();
    expect(response.status).toBe(200);
  });

  it("returns 503 with a fixed detail when Voyage fails", async () => {
    await seedProjectSource(SOURCE_P, PROJECT_P, "permissions model access control");
    await seedScopedApiKey(PROJECT_P);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("fail", { status: 500 })),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ query: "permissions model access control" }),
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    vi.unstubAllGlobals();
    expect(response.status).toBe(502);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe("Retrieval upstream unavailable");
  });

  it("does not return another project's chunk for keyword search", async () => {
    await clearData();
    await seedProjectSource(SOURCE_P, PROJECT_P, "alpha beta gamma in project P");
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, project_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, ?, 'github_repo', 'owner/repo2', ?, 'RepoQ', 'ready')`,
    )
      .bind(SOURCE_Q, USER_ID, PROJECT_Q, CONNECTION_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'q.md', 0, ?, '[]')`,
    )
      .bind(SOURCE_Q, "alpha beta gamma in project Q secret")
      .run();
    await seedScopedApiKey(PROJECT_P);
    const cfg = loadConfig(testEnv());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              index: 0,
              data: [
                {
                  index: 0,
                  embedding: Array.from(
                    { length: cfg.embeddingDimensions },
                    () => 0.02,
                  ),
                },
              ],
            },
          ],
          model: cfg.voyageModel,
        }),
      ),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({ query: "alpha beta gamma" }),
      }),
      {
        ...testEnv(),
        VECTORIZE: {
          query: vi.fn(async () => ({ matches: [] })),
        } as unknown as VectorizeIndex,
      },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    vi.unstubAllGlobals();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { chunks: Array<{ content: string }> };
    expect(body.chunks.every((chunk) => !chunk.content.includes("project Q"))).toBe(
      true,
    );
  });
});
