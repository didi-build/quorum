import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import {
  hashApiKey,
  resetBootstrapApiKeyGuard,
} from "../../src/domain/auth/api-key.js";
import { chunkVectorId } from "../../src/domain/ingestion/vector-id.js";
import * as deleteVectors from "../../src/domain/ingestion/delete-vectors.js";
import { clearInstallationTokenCache } from "../../src/domain/oauth/github-app.js";
import type { Env } from "../../src/env.js";
import worker from "../../src/index";
import { generateTestPrivateKeyBase64 } from "../fixtures/github-app-test-key.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";
const MISSING_CONNECTION_ID = "00000000-0000-4000-8000-000000000088";
const MISSING_SOURCE_ID = "00000000-0000-4000-8000-000000000089";
const SCOPED_API_KEY = "sources-scoped-test-key";
const OTHER_USER_API_KEY = "sources-other-user-key";

const CONNECTION_NOT_FOUND_BODY = { detail: "Connection not found" };
const SOURCE_NOT_FOUND_BODY = { detail: "Knowledge source not found" };

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

async function seedOtherUserApiKey(): Promise<void> {
  const keyHash = await hashApiKey(OTHER_USER_API_KEY);
  await env.DB.prepare(
    "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, ?, NULL)",
  )
    .bind(crypto.randomUUID(), keyHash, OTHER_USER_ID)
    .run();
}

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM api_keys").run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(OTHER_USER_ID).run();
}

async function insertGithubConnection(
  connectionId: string,
  userId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
  )
    .bind(connectionId, userId)
    .run();
}

async function insertReadySource(
  sourceId: string,
  userId: string,
  connectionId: string,
  externalRef = "org/repo",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', ?, ?, 'Repo', 'ready')`,
  )
    .bind(sourceId, userId, externalRef, connectionId)
    .run();
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

  it("returns 401 on all five routes when unauthenticated", async () => {
    const bindings = await testBindings();
    const sourceId = crypto.randomUUID();
    const routes: Array<{ method: string; path: string; body?: string }> = [
      { method: "GET", path: "/sources" },
      {
        method: "POST",
        path: "/sources",
        body: JSON.stringify({
          connection_id: MISSING_CONNECTION_ID,
          source_type: "github_repo",
          external_ref: "org/repo",
          name: "Repo",
        }),
      },
      { method: "GET", path: `/sources/${sourceId}` },
      { method: "DELETE", path: `/sources/${sourceId}` },
      { method: "POST", path: `/sources/${sourceId}/refresh` },
    ];

    for (const route of routes) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${route.path}`, {
          method: route.method,
          headers: route.body ? { "Content-Type": "application/json" } : undefined,
          body: route.body,
        }),
        bindings,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status, route.path).toBe(401);
      expect(await response.json(), route.path).toEqual({
        detail: "Not authenticated",
      });
    }
  });

  it("POST /sources returns identical 404 for missing and foreign connection ids", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const foreignConnectionId = crypto.randomUUID();
    await insertGithubConnection(foreignConnectionId, OTHER_USER_ID);

    const payload = {
      connection_id: "",
      source_type: "github_repo",
      external_ref: "org/repo",
      name: "Repo",
    };

    const missingCtx = createExecutionContext();
    const missingResponse = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.bootstrapApiKey,
        },
        body: JSON.stringify({ ...payload, connection_id: MISSING_CONNECTION_ID }),
      }),
      bindings,
      missingCtx,
    );
    await waitOnExecutionContext(missingCtx);

    const foreignCtx = createExecutionContext();
    const foreignResponse = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.bootstrapApiKey,
        },
        body: JSON.stringify({ ...payload, connection_id: foreignConnectionId }),
      }),
      bindings,
      foreignCtx,
    );
    await waitOnExecutionContext(foreignCtx);

    expect(missingResponse.status).toBe(404);
    expect(foreignResponse.status).toBe(404);
    const missingJson = await missingResponse.json();
    const foreignJson = await foreignResponse.json();
    expect(missingJson).toEqual(CONNECTION_NOT_FOUND_BODY);
    expect(foreignJson).toEqual(CONNECTION_NOT_FOUND_BODY);
    expect(foreignJson).toEqual(missingJson);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources returns 404 Connection not found for type mismatch on the caller connection", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);

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

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(CONNECTION_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources returns 404 Connection not found for a disallowed project_id", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    await seedScopedApiKey(PROJECT_P);
    const ownConnectionId = crypto.randomUUID();
    await insertGithubConnection(ownConnectionId, DEFAULT_USER_ID);

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
    expect(await response.json()).toEqual(CONNECTION_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources stores the scoped API key project when project_id is omitted", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    await seedScopedApiKey(PROJECT_P);
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": SCOPED_API_KEY,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          source_type: "github_repo",
          external_ref: "org/repo",
          name: "Repo",
        }),
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { project_id: string | null };
    expect(body.project_id).toBe(PROJECT_P);
  });

  it("POST /sources creates a pending source and enqueues indexing", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);

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

  it("GET /sources/{id} returns identical 404 for missing and other users sources", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(otherSourceId, OTHER_USER_ID, connectionId);

    const missingCtx = createExecutionContext();
    const missingResponse = await worker.fetch(
      new Request(`http://test/sources/${MISSING_SOURCE_ID}`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      missingCtx,
    );
    await waitOnExecutionContext(missingCtx);

    const foreignCtx = createExecutionContext();
    const foreignResponse = await worker.fetch(
      new Request(`http://test/sources/${otherSourceId}`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      foreignCtx,
    );
    await waitOnExecutionContext(foreignCtx);

    expect(missingResponse.status).toBe(404);
    expect(foreignResponse.status).toBe(404);
    const missingJson = await missingResponse.json();
    const foreignJson = await foreignResponse.json();
    expect(missingJson).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(foreignJson).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(foreignJson).toEqual(missingJson);
  });

  it("GET /sources omits other users sources from the list", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const ownSourceId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(ownSourceId, DEFAULT_USER_ID, connectionId, "org/own");
    await insertReadySource(otherSourceId, OTHER_USER_ID, connectionId, "org/other");

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
  });

  it("DELETE /sources/{id} returns identical 404 for missing and other users sources", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(otherSourceId, OTHER_USER_ID, connectionId);

    const missingCtx = createExecutionContext();
    const missingResponse = await worker.fetch(
      new Request(`http://test/sources/${MISSING_SOURCE_ID}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      missingCtx,
    );
    await waitOnExecutionContext(missingCtx);

    const foreignCtx = createExecutionContext();
    const foreignResponse = await worker.fetch(
      new Request(`http://test/sources/${otherSourceId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      foreignCtx,
    );
    await waitOnExecutionContext(foreignCtx);

    expect(missingResponse.status).toBe(404);
    expect(foreignResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(await foreignResponse.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("DELETE /sources/{id} by another user leaves the source intact and does not enqueue", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    await seedOtherUserApiKey();
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(sourceId, DEFAULT_USER_ID, connectionId);
    await env.DB.prepare(
      `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, 'keep-me', '[]')`,
    )
      .bind(sourceId)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/sources/${sourceId}`, {
        method: "DELETE",
        headers: { "X-API-Key": OTHER_USER_API_KEY },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();

    const sourceRow = await env.DB.prepare(
      "SELECT status FROM knowledge_sources WHERE id = ?",
    )
      .bind(sourceId)
      .first<{ status: string }>();
    expect(sourceRow?.status).toBe("ready");

    const chunkRow = await env.DB.prepare(
      "SELECT content FROM chunks WHERE knowledge_source_id = ?",
    )
      .bind(sourceId)
      .first<{ content: string }>();
    expect(chunkRow?.content).toBe("keep-me");
  });

  it("DELETE /sources/{id} removes the source, chunks, and vector ids", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(sourceId, DEFAULT_USER_ID, connectionId);
    await env.DB.prepare(
      `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, 'hello', '[]')`,
    )
      .bind(sourceId)
      .run();

    const vectorId = await chunkVectorId(sourceId, "README.md", 0);
    const deleteVectorsSpy = vi
      .spyOn(deleteVectors, "deleteChunkVectors")
      .mockResolvedValue(undefined);

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
    expect(deleteVectorsSpy).toHaveBeenCalledTimes(1);
    expect(deleteVectorsSpy.mock.calls[0]?.[1]).toEqual([vectorId]);

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

  it("POST /sources/{id}/refresh returns identical 404 for missing and other users sources", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(otherSourceId, OTHER_USER_ID, connectionId);

    const missingCtx = createExecutionContext();
    const missingResponse = await worker.fetch(
      new Request(`http://test/sources/${MISSING_SOURCE_ID}/refresh`, {
        method: "POST",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      missingCtx,
    );
    await waitOnExecutionContext(missingCtx);

    const foreignCtx = createExecutionContext();
    const foreignResponse = await worker.fetch(
      new Request(`http://test/sources/${otherSourceId}/refresh`, {
        method: "POST",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      foreignCtx,
    );
    await waitOnExecutionContext(foreignCtx);

    expect(missingResponse.status).toBe(404);
    expect(foreignResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(await foreignResponse.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("POST /sources/{id}/refresh by another user leaves the source unchanged and does not enqueue", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    await seedOtherUserApiKey();
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(sourceId, DEFAULT_USER_ID, connectionId);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/sources/${sourceId}/refresh`, {
        method: "POST",
        headers: { "X-API-Key": OTHER_USER_API_KEY },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(SOURCE_NOT_FOUND_BODY);
    expect(queueSend).not.toHaveBeenCalled();

    const row = await env.DB.prepare(
      "SELECT status, status_message FROM knowledge_sources WHERE id = ?",
    )
      .bind(sourceId)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.status_message).toBeNull();
  });

  it("POST /sources/{id}/refresh queues re-indexing with the v1 status message", async () => {
    const queueSend = vi.fn();
    const bindings = await testBindings(queueSend);
    const cfg = loadConfig(bindings);
    const sourceId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await insertGithubConnection(connectionId, DEFAULT_USER_ID);
    await insertReadySource(sourceId, DEFAULT_USER_ID, connectionId);

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
