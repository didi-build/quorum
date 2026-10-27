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

async function testEnvWithGithubApp() {
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

async function seedGithubConnection(installationId = "123"): Promise<string> {
  const connectionId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 1, 'default-user')",
  )
    .bind(DEFAULT_USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
      id, user_id, provider, installation_id, external_account_id, external_account_name
    ) VALUES (?, ?, 'github', ?, 'acct', 'github-user')`,
  )
    .bind(connectionId, DEFAULT_USER_ID, installationId)
    .run();
  return connectionId;
}

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
}

describe("connection available-sources (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    clearInstallationTokenCache();
    await clearData();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("paginates GitHub repos and marks already-added sources", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = await seedGithubConnection();
    const existingSourceId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/existing', ?, 'org/existing', 'ready')`,
    )
      .bind(existingSourceId, DEFAULT_USER_ID, connectionId)
      .run();

    const pageOneRepos = Array.from({ length: 99 }, (_, index) => ({
      full_name: `org/padding-${index}`,
      private: false,
      updated_at: "2026-01-01T00:00:00Z",
    }));
    pageOneRepos.unshift({
      full_name: "org/existing",
      private: true,
      updated_at: "2026-01-01T00:00:00Z",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: "installation-token",
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }),
            { status: 200 },
          );
        }
        if (url.includes("/installation/repositories")) {
          const page = new URL(url).searchParams.get("page") ?? "1";
          if (page === "1") {
            return new Response(
              JSON.stringify({ total_count: 101, repositories: pageOneRepos }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              total_count: 101,
              repositories: [
                {
                  full_name: "org/new",
                  private: false,
                  updated_at: "2026-02-01T00:00:00Z",
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
      new Request(`http://test/connections/${connectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      provider: string;
      items: Array<{
        external_ref: string;
        already_added: boolean;
        source_id: string | null;
        private: boolean;
      }>;
    };
    expect(payload.provider).toBe("github");
    expect(payload.items).toHaveLength(101);
    const byRef = new Map(payload.items.map((item) => [item.external_ref, item]));
    expect(byRef.get("org/existing")?.already_added).toBe(true);
    expect(byRef.get("org/existing")?.source_id).toBe(existingSourceId);
    expect(byRef.get("org/new")?.already_added).toBe(false);
    expect(byRef.get("org/new")?.private).toBe(false);
  });

  it("maps GitHub 403 to reconnect detail", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = await seedGithubConnection();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: "installation-token",
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }),
            { status: 200 },
          );
        }
        return new Response("forbidden", { status: 403 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("Reconnect GitHub");
  });

  it("maps GitHub 429 on installation token mint to provider rate limit detail", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = await seedGithubConnection();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access_tokens")) {
          return new Response("rate limited", { status: 429 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(429);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "Provider rate limit exceeded. Try again shortly.",
    );
  });

  it("maps GitHub 429 on repository list to provider rate limit detail", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const connectionId = await seedGithubConnection();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: "installation-token",
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }),
            { status: 200 },
          );
        }
        return new Response("rate limited", { status: 429 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(429);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "Provider rate limit exceeded. Try again shortly.",
    );
  });

  it("returns 404 for another user's connection", async () => {
    const bindings = await testEnvWithGithubApp();
    const cfg = loadConfig(bindings);
    const otherUserId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, github_id, login) VALUES (?, 2, 'other')",
    )
      .bind(otherUserId)
      .run();
    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '999', 'other', 'other-user')`,
    )
      .bind(connectionId, otherUserId)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}/available-sources`, {
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });
});
