import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import {
  hashApiKey,
  resetBootstrapApiKeyGuard,
} from "../../src/domain/auth/api-key.js";
import { clearInstallationTokenCache } from "../../src/domain/oauth/github-app.js";
import * as deleteVectors from "../../src/domain/ingestion/delete-vectors.js";
import type { Env } from "../../src/env.js";
import worker from "../../src/index";
import { generateTestPrivateKeyBase64 } from "../fixtures/github-app-test-key.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";
const SCOPED_API_KEY = "sources-scoped-test-key";

async function testBindings(
  queueSend: ReturnType<typeof vi.fn> = vi.fn(),
): Promise<Env> {
  const privateKeyBase64 = await generateTestPrivateKeyBase64();
  return workerEnvWithSecrets({
    ...env,
    INDEXING_QUEUE: { send: queueSend } as unknown as Env["INDEXING_QUEUE"],
    ...withTestConfigEnv({
      GITHUB_APP_ID: "123456",
      GITHUB_APP_SLUG: "quorum-test-app",
      GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      AUTH_ALLOWED_GITHUB_IDS: "1,2",
      BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
    }),
  }) as unknown as Env;
}

async function seedUsers(): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 1, 'default-user')",
  )
    .bind(DEFAULT_USER_ID)
    .run();
  await env.DB.prepare(
    "INSERT INTO users (id, github_id, login) VALUES (?, 2, 'other-user')",
  )
    .bind(OTHER_USER_ID)
    .run();
}

async function seedScopedApiKey(projectId: string): Promise<void> {
  const keyHash = await hashApiKey(SCOPED_API_KEY);
  await env.DB.prepare(
    "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), keyHash, DEFAULT_USER_ID, projectId)
    .run();
}

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM api_keys").run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(OTHER_USER_ID).run();
}

describe("knowledge sources API (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    clearInstallationTokenCache();
    await clearData();
    await seedUsers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POST /sources returns 404 for another user's connection", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const otherConnectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2002', 'acct-other', 'other-github')`,
    )
      .bind(otherConnectionId, OTHER_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.bootstrapApiKey,
        },
        body: JSON.stringify({
          connection_id: otherConnectionId,
          source_type: "github_repo",
          external_ref: "org/repo",
          name: "Repo",
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Connection not found" });
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources returns 404 when a P-scoped actor sends project_id Q", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    await seedScopedApiKey(PROJECT_P);
    const ownConnectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(ownConnectionId, DEFAULT_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": SCOPED_API_KEY,
        },
        body: JSON.stringify({
          connection_id: ownConnectionId,
          source_type: "github_repo",
          external_ref: "org/repo",
          name: "Repo",
          project_id: PROJECT_Q,
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources creates a pending source and enqueues indexing", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.bootstrapApiKey,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          source_type: "github_repo",
          external_ref: "org/repo",
          name: "My repo",
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      status: string;
      user_id: string;
      connection_id: string;
    };
    expect(body.status).toBe("pending");
    expect(body.user_id).toBe(DEFAULT_USER_ID);
    expect(body.connection_id).toBe(connectionId);
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(queueSend.mock.calls[0][0]).toEqual({ source_id: body.id });
  });

  it("POST /sources returns 400 when source_type does not match the connection provider", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.bootstrapApiKey,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          source_type: "linear",
          external_ref: "team-id",
          name: "Team",
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detail: "linear sources require a Linear connection",
    });
  });

  it("GET /sources and GET /sources/{id} hide other users' sources", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const ownSourceId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/own', ?, 'Own', 'ready')`,
    )
      .bind(ownSourceId, DEFAULT_USER_ID, connectionId)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/other', ?, 'Other', 'ready')`,
    )
      .bind(otherSourceId, OTHER_USER_ID, connectionId)
      .run();

    const listCtx = createExecutionContext();
    const listResponse = await worker.fetch(
      new Request("http://test/sources", {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      listCtx,
    );
    await waitOnExecutionContext(listCtx);

    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      sources: Array<{ id: string }>;
    };
    expect(listPayload.sources.map((s) => s.id)).toEqual([ownSourceId]);

    const getCtx = createExecutionContext();
    const getResponse = await worker.fetch(
      new Request(`http://test/sources/${otherSourceId}`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      getCtx,
    );
    await waitOnExecutionContext(getCtx);
    expect(getResponse.status).toBe(404);
  });

  it("DELETE /sources/{id} removes the source and its chunks", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready')`,
    )
      .bind(sourceId, DEFAULT_USER_ID, connectionId)
      .run();

    await env.DB.prepare(
      `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, 'hello', '[]')`,
    )
      .bind(sourceId)
      .run();

    vi.spyOn(deleteVectors, "deleteChunkVectors").mockResolvedValue(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/sources/${sourceId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(204);

    const sourceRow = await env.DB.prepare(
      "SELECT id FROM knowledge_sources WHERE id = ?",
    )
      .bind(sourceId)
      .first();
    expect(sourceRow).toBeNull();

    const chunkCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM chunks WHERE knowledge_source_id = ?",
    )
      .bind(sourceId)
      .first<{ count: number }>();
    expect(chunkCount?.count).toBe(0);
  });

  it("POST /sources/{id}/refresh queues re-indexing with the v1 status message", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready')`,
    )
      .bind(sourceId, DEFAULT_USER_ID, connectionId)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/sources/${sourceId}/refresh`, {
        method: "POST",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; status_message: string };
    expect(body.status).toBe("pending");
    expect(body.status_message).toBe("Queued for re-indexing");
    expect(queueSend).toHaveBeenCalledWith({ source_id: sourceId });
  });
});
