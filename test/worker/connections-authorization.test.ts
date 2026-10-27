import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { clearInstallationTokenCache } from "../../src/domain/oauth/github-app.js";
import worker from "../../src/index";
import { generateTestPrivateKeyBase64 } from "../fixtures/github-app-test-key.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";

async function testBindings() {
  const privateKeyBase64 = await generateTestPrivateKeyBase64();
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      GITHUB_APP_ID: "123456",
      GITHUB_APP_SLUG: "quorum-test-app",
      GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
    }),
  });
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

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(OTHER_USER_ID).run();
}

describe("connections authorization (worker integration)", () => {
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

  it("GET /connections omits another user's connection", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const ownConnectionId = crypto.randomUUID();
    const otherConnectionId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(ownConnectionId, DEFAULT_USER_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2002', 'acct-other', 'other-github')`,
    )
      .bind(otherConnectionId, OTHER_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/connections", {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { connections: Array<{ id: string }> };
    const ids = payload.connections.map((c) => c.id);
    expect(ids).toContain(ownConnectionId);
    expect(ids).not.toContain(otherConnectionId);
  });

  it("DELETE /connections/{id} returns 404 for another user's connection and leaves the row", async () => {
    const bindings = await testBindings();
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
      new Request(`http://test/connections/${otherConnectionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    const row = await env.DB.prepare("SELECT id FROM connections WHERE id = ?")
      .bind(otherConnectionId)
      .first();
    expect(row).not.toBeNull();
  });

  it("available-sources does not mark another user's sources as already added", async () => {
    const bindings = await testBindings();
    const cfg = loadConfig(bindings);
    const ownConnectionId = crypto.randomUUID();
    const otherSourceId = crypto.randomUUID();
    const sharedRef = "org/shared-repo";

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(ownConnectionId, DEFAULT_USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', ?, ?, ?, 'ready')`,
    )
      .bind(otherSourceId, OTHER_USER_ID, sharedRef, ownConnectionId, sharedRef)
      .run();

    const installationToken = "secret-installation-token-for-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: installationToken,
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }),
            { status: 200 },
          );
        }
        if (url.includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              repositories: [
                {
                  full_name: sharedRef,
                  private: false,
                  updated_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${ownConnectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).not.toContain(installationToken);
    const payload = JSON.parse(bodyText) as {
      items: Array<{
        external_ref: string;
        already_added: boolean;
        source_id: string | null;
      }>;
    };
    const item = payload.items.find((row) => row.external_ref === sharedRef);
    expect(item).toBeDefined();
    expect(item?.already_added).toBe(false);
    expect(item?.source_id).toBeNull();
  });
});
