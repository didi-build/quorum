import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import {
  hashApiKey,
  resetBootstrapApiKeyGuard,
} from "../../src/domain/auth/api-key.js";
import { accessibleReadySourceIds } from "../../src/domain/retrieval/service.js";
import { loadConfig } from "../../src/config/load-config.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SHARED_P = "00000000-0000-4000-8000-000000000040";
const SHARED_Q = "00000000-0000-4000-8000-000000000041";
const API_KEY_P = "retrieval-scoped-p-key";
const API_KEY_GLOBAL = "retrieval-global-key";

const KEYWORD_QUERY = "retrieval shared alpha beta gamma";

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

async function ensureUser(): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 42, 'retrieval-user')",
  )
    .bind(USER_ID)
    .run();
}

async function seedConnection(): Promise<void> {
  await ensureUser();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '12345', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();
}

async function seedSharedSource(
  sourceId: string,
  projectId: string,
  marker: string,
): Promise<void> {
  await seedConnection();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, NULL, ?, 'github_repo', ?, ?, ?, 'ready')`,
  )
    .bind(
      sourceId,
      projectId,
      `shared/${projectId}`,
      CONNECTION_ID,
      `Shared ${projectId}`,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'shared.md', 0, ?, '[]')`,
  )
    .bind(sourceId, `${KEYWORD_QUERY} ${marker}`)
    .run();
}

async function seedApiKey(key: string, projectId: string | null): Promise<void> {
  await ensureUser();
  const keyHash = await hashApiKey(key);
  await env.DB.prepare(
    "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), keyHash, USER_ID, projectId)
    .run();
}

function stubVoyage(cfg: ReturnType<typeof loadConfig>): void {
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
                embedding: Array.from({ length: cfg.embeddingDimensions }, () => 0.02),
              },
            ],
          },
        ],
        model: cfg.voyageModel,
      }),
    ),
  );
}

describe("shared project sources and retrieval scope (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await clearData();
  });

  it("does not expose shared project Q to a P-scoped API key", async () => {
    await seedSharedSource(SHARED_P, PROJECT_P, "marker-shared-P");
    await seedSharedSource(SHARED_Q, PROJECT_Q, "marker-shared-Q");
    await seedApiKey(API_KEY_P, PROJECT_P);
    const cfg = loadConfig(testEnv());
    stubVoyage(cfg);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY_P,
        },
        body: JSON.stringify({ query: KEYWORD_QUERY }),
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
    const body = (await response.json()) as {
      chunks: Array<{ content: string; knowledge_source_id: string }>;
    };
    expect(body.chunks.length).toBeGreaterThan(0);
    expect(body.chunks.some((chunk) => chunk.content.includes("marker-shared-P"))).toBe(
      true,
    );
    expect(
      body.chunks.every((chunk) => !chunk.content.includes("marker-shared-Q")),
    ).toBe(true);
    expect(body.chunks.every((chunk) => chunk.knowledge_source_id !== SHARED_Q)).toBe(
      true,
    );
  });

  it("does not expose shared project Q to an unscoped API key", async () => {
    await seedSharedSource(SHARED_P, PROJECT_P, "marker-shared-P");
    await seedSharedSource(SHARED_Q, PROJECT_Q, "marker-shared-Q");
    await seedApiKey(API_KEY_GLOBAL, null);
    const cfg = loadConfig(testEnv());
    stubVoyage(cfg);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY_GLOBAL,
        },
        body: JSON.stringify({ query: KEYWORD_QUERY }),
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
    expect(
      body.chunks.every((chunk) => !chunk.content.includes("marker-shared-Q")),
    ).toBe(true);
    expect(
      body.chunks.every((chunk) => !chunk.content.includes("marker-shared-P")),
    ).toBe(true);
  });

  it("allows a P-scoped API key to read a shared project P source", async () => {
    await seedSharedSource(SHARED_P, PROJECT_P, "marker-shared-P-only");
    await seedApiKey(API_KEY_P, PROJECT_P);
    const cfg = loadConfig(testEnv());
    stubVoyage(cfg);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY_P,
        },
        body: JSON.stringify({ query: KEYWORD_QUERY }),
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

    const body = (await response.json()) as {
      chunks: Array<{ content: string; knowledge_source_id: string }>;
    };
    expect(body.chunks.length).toBeGreaterThan(0);
    expect(body.chunks[0]?.knowledge_source_id).toBe(SHARED_P);
    expect(body.chunks[0]?.content).toContain("marker-shared-P-only");
  });

  it("SQL scoped source ids exclude shared Q for a P-scoped actor", async () => {
    await seedSharedSource(SHARED_P, PROJECT_P, "marker-shared-P");
    await seedSharedSource(SHARED_Q, PROJECT_Q, "marker-shared-Q");

    const ids = await accessibleReadySourceIds(env.DB, USER_ID, PROJECT_P);
    expect(ids).toContain(SHARED_P);
    expect(ids).not.toContain(SHARED_Q);
  });
});
