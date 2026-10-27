import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_CONNECTION_NONCE_COOKIE_NAME } from "../../src/domain/auth/cookies.js";
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

function oauthConnectionNonceCookieHeader(nonce: string): string {
  return `${OAUTH_CONNECTION_NONCE_COOKIE_NAME}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`;
}

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

  it("redirects GET /oauth/linear/authorize to Linear with signed state, actor=app, and nonce cookie", async () => {
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
    const cookies = response.headers.getSetCookie();
    expect(
      cookies.some((c) => c.startsWith(`${OAUTH_CONNECTION_NONCE_COOKIE_NAME}=`)),
    ).toBe(true);
  });

  it("callback exchanges code with matching nonce cookie, encrypts tokens, and redirects", async () => {
    const cfg = loadConfig(testEnv());
    const user = await getOrCreateUser(env.DB, 424242, "linear-callback-user");
    const { state, nonce } = await createOauthState(cfg.tokenEncryptionKey, user.id);
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);

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
        { headers: { Cookie: oauthConnectionNonceCookieHeader(nonce) } },
      ),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    vi.restoreAllMocks();
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
    expect(row?.token_expires_at).toBe(new Date(fixedNow + 3600 * 1000).toISOString());
  });

  it("callback rejects missing nonce cookie without D1 write or token exchange", async () => {
    const cfg = loadConfig(testEnv());
    const user = await getOrCreateUser(env.DB, 424242, "linear-missing-cookie");
    const { state } = await createOauthState(cfg.tokenEncryptionKey, user.id);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        `http://test/oauth/linear/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      ),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const row = await env.DB.prepare(
      "SELECT id FROM connections WHERE user_id = ? AND provider = 'linear'",
    )
      .bind(user.id)
      .first();
    expect(row).toBeNull();
  });

  it("callback rejects wrong nonce cookie without D1 write", async () => {
    const cfg = loadConfig(testEnv());
    const user = await getOrCreateUser(env.DB, 424242, "linear-wrong-cookie");
    const { state } = await createOauthState(cfg.tokenEncryptionKey, user.id);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        `http://test/oauth/linear/callback?code=auth-code&state=${encodeURIComponent(state)}`,
        { headers: { Cookie: oauthConnectionNonceCookieHeader("wrong-nonce-value") } },
      ),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callback rejects replayed state after successful connect", async () => {
    const cfg = loadConfig(testEnv());
    const user = await getOrCreateUser(env.DB, 424242, "linear-replay");
    const { state, nonce } = await createOauthState(cfg.tokenEncryptionKey, user.id);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "mock-linear-access",
              refresh_token: "mock-linear-refresh",
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

    const callbackUrl = `http://test/oauth/linear/callback?code=auth-code&state=${encodeURIComponent(state)}`;
    const cookie = oauthConnectionNonceCookieHeader(nonce);

    const ctx1 = createExecutionContext();
    const first = await worker.fetch(
      new Request(callbackUrl, { headers: { Cookie: cookie } }),
      testEnv(),
      ctx1,
    );
    await waitOnExecutionContext(ctx1);
    expect(first.status).toBe(307);

    const ctx2 = createExecutionContext();
    const second = await worker.fetch(
      new Request(callbackUrl, { headers: { Cookie: cookie } }),
      testEnv(),
      ctx2,
    );
    await waitOnExecutionContext(ctx2);
    expect(second.status).toBe(400);
  });

  it("callback rejects forged state at the route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(
        "http://test/oauth/linear/callback?code=auth-code&state=forged-state-token",
        { headers: { Cookie: oauthConnectionNonceCookieHeader("any-nonce") } },
      ),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
