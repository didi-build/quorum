import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createOauthState } from "../../src/domain/oauth/state.js";
import worker from "../../src/index";
import { generateTestPrivateKeyBase64 } from "../fixtures/github-app-test-key.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";

async function testEnvWithGithubApp(overrides: Record<string, string> = {}) {
  const privateKeyBase64 = await generateTestPrivateKeyBase64();
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      APP_BASE_URL: "http://test",
      AUTH_ALLOWED_GITHUB_IDS: "1",
      GITHUB_APP_ID: "123456",
      GITHUB_APP_SLUG: "quorum-test-app",
      GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
      ...overrides,
    }),
  });
}

async function seedDefaultUser(): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, ?, ?)",
  )
    .bind(DEFAULT_USER_ID, 1, "default-user")
    .run();
}

async function clearConnectionData(): Promise<void> {
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
}

describe("GitHub App OAuth and connections (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await clearConnectionData();
    await seedDefaultUser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("GET /oauth/github/authorize returns 503 when the app is not configured", async () => {
    const bindings = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({
        GITHUB_APP_ID: "",
        GITHUB_APP_SLUG: "",
      }),
    });
    const cfg = loadConfig(bindings);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/oauth/github/authorize", {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "GitHub App is not configured",
    );
  });

  it("GET /oauth/github/authorize redirects to GitHub App install URL with signed state", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/oauth/github/authorize", {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(307);
    const location = response.headers.get("Location") ?? "";
    expect(
      location.startsWith("https://github.com/apps/quorum-test-app/installations/new"),
    ).toBe(true);
    const state = new URL(location).searchParams.get("state");
    expect(state).toBeTruthy();
  });

  it("GET /oauth/github/callback rejects forged state", async () => {
    const bindings = await testEnvWithGithubApp();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        "http://test/oauth/github/callback?installation_id=12345&state=forged-state-token",
      ),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "Invalid or expired OAuth state",
    );
  });

  it("GET /oauth/github/callback upserts connection and redirects to connections UI", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const state = await createOauthState(cfg.tokenEncryptionKey, DEFAULT_USER_ID);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/app/installations/")) {
          return new Response(
            JSON.stringify({ account: { id: 42, login: "test-user" } }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        `http://test/oauth/github/callback?installation_id=12345&state=${encodeURIComponent(state)}`,
      ),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "http://test/app/connections?provider=github&status=connected",
    );

    const row = await env.DB.prepare(
      "SELECT installation_id, access_token_ciphertext, external_account_name FROM connections WHERE user_id = ? AND provider = 'github'",
    )
      .bind(DEFAULT_USER_ID)
      .first<{
        installation_id: string | null;
        access_token_ciphertext: string | null;
        external_account_name: string;
      }>();
    expect(row?.installation_id).toBe("12345");
    expect(row?.access_token_ciphertext).toBeNull();
    expect(row?.external_account_name).toBe("test-user");
  });

  it("GET /connections lists connections for the actor", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'inst-1', 'acct', 'github-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
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
    expect(payload.connections).toHaveLength(1);
    expect(payload.connections[0].id).toBe(connectionId);
  });

  it("DELETE /connections/{id} removes the connection", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'inst-1', 'acct', 'github-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);

    const row = await env.DB.prepare("SELECT id FROM connections WHERE id = ?")
      .bind(connectionId)
      .first();
    expect(row).toBeNull();
  });
});
