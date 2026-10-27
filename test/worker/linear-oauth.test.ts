import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOauthState } from "../../src/domain/oauth/state.js";
import {
  createBrowserSession,
  getOrCreateUser,
} from "../../src/domain/auth/browser-session.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

function testEnv(overrides: Record<string, string> = {}) {
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "424242",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
      LINEAR_CLIENT_ID: "test-linear-client-id",
      ...overrides,
    }),
  });
}

async function seedUserWithSession(): Promise<{ cookie: string }> {
  const cfg = loadConfig(testEnv());
  const user = await getOrCreateUser(env.DB, 424242, "linear-oauth-user");
  const { rawToken } = await createBrowserSession(env.DB, cfg, user.id);
  return { cookie: `${cfg.sessionCookieName}=${rawToken}` };
}

describe("Linear OAuth (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("redirects GET /oauth/linear/authorize to Linear with signed state and actor=app", async () => {
    const { cookie } = await seedUserWithSession();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/oauth/linear/authorize", {
        headers: { Cookie: cookie },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(307);
    const location = response.headers.get("Location");
    expect(location).toContain("https://linear.app/oauth/authorize");
    const url = new URL(location ?? "");
    expect(url.searchParams.get("actor")).toBe("app");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("callback exchanges code, encrypts tokens, and redirects to connections", async () => {
    const cfg = loadConfig(testEnv());
    const user = await getOrCreateUser(env.DB, 424242, "linear-callback-user");
    const state = await createOauthState(cfg.tokenEncryptionKey, user.id);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "mock-linear-access",
              refresh_token: "mock-linear-refresh",
              expires_in: 3600,
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/graphql")) {
          return new Response(
            JSON.stringify({
              data: { viewer: { id: "linear-user-id", name: "Linear User" } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        `http://test/oauth/linear/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      ),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "http://test/app/connections?provider=linear&status=connected",
    );

    const row = await env.DB.prepare(
      `SELECT access_token_ciphertext, refresh_token_ciphertext, token_expires_at, external_account_name
       FROM connections WHERE user_id = ? AND provider = 'linear'`,
    )
      .bind(user.id)
      .first<{
        access_token_ciphertext: string;
        refresh_token_ciphertext: string;
        token_expires_at: string | null;
        external_account_name: string;
      }>();
    expect(row?.access_token_ciphertext).toBeTruthy();
    expect(row?.access_token_ciphertext).not.toContain("mock-linear-access");
    expect(row?.refresh_token_ciphertext).toBeTruthy();
    expect(row?.external_account_name).toBe("Linear User");
    expect(row?.token_expires_at).toBeTruthy();
  });
});
