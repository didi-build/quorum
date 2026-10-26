import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoginOauthState } from "../../src/domain/auth/signing.js";
import worker from "../../src/index";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { oauthLoginNonceCookieHeader } from "./oauth-callback-cookies.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const OAUTH_NONCE_CLEAR_COOKIE =
  "__Host-quorum_oauth_login_nonce=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0";
const OAUTH_NONCE_SET_REGEX = new RegExp(
  "^__Host-quorum_oauth_login_nonce=[A-Za-z0-9_-]+; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$",
);
const CALLBACK_FAILURE_LOG = JSON.stringify({ event: "github_oauth_callback_failed" });

function testEnv(overrides: Record<string, string> = {}) {
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "12345",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
      ...overrides,
    }),
  });
}

function expectNonceClearCookie(cookies: string[]): void {
  expect(cookies).toContain(OAUTH_NONCE_CLEAR_COOKIE);
}

function expectCallbackErrorLog(errorSpy: ReturnType<typeof vi.spyOn>): void {
  expect(errorSpy.mock.calls).toEqual([[CALLBACK_FAILURE_LOG]]);
}

describe("GitHub OAuth callback (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sets __Host login nonce cookie on GET /auth/github/login", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/github/login"),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(307);
    const cookies = response.headers.getSetCookie();
    const nonceSet = cookies.find((c) =>
      c.startsWith("__Host-quorum_oauth_login_nonce="),
    );
    expect(nonceSet).toBeDefined();
    expect(nonceSet).toMatch(OAUTH_NONCE_SET_REGEX);
  });

  it("allowlisted user gets session cookie and redirect to /app/", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({ access_token: "github-access-token" }), {
            status: 200,
          });
        }
        if (url.includes("api.github.com/user")) {
          return new Response(JSON.stringify({ id: 12345, login: "didi" }), {
            status: 200,
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("http://test/app/");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("quorum_session="))).toBe(true);
    expectNonceClearCookie(cookies);
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c) => c.includes("Secure"))).toBe(true);
    expect(cookies.some((c) => c.includes("SameSite=Lax"))).toBe(true);
  });

  it("non-allowlisted user gets display cookie and redirect to not-allowed", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({ access_token: "github-access-token" }), {
            status: 200,
          });
        }
        if (url.includes("api.github.com/user")) {
          return new Response(JSON.stringify({ id: 99999, login: "stranger" }), {
            status: 200,
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("http://test/app/not-allowed");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("quorum_session="))).toBe(false);
    expect(cookies.some((c) => c.startsWith("quorum_auth_display="))).toBe(true);
    expectNonceClearCookie(cookies);
  });

  it("rejects invalid OAuth state and clears the nonce cookie", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/github/callback?code=test-code&state=not-valid"),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expectNonceClearCookie(response.headers.getSetCookie());
  });

  it("rejects callback when OAuth nonce cookie is missing", async () => {
    const { state } = await createLoginOauthState("test-session-secret");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expectNonceClearCookie(response.headers.getSetCookie());
  });

  it("rejects callback when OAuth nonce cookie is mismatched without calling GitHub", async () => {
    const { state } = await createLoginOauthState("test-session-secret");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader("wrong-nonce") },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expectNonceClearCookie(response.headers.getSetCookie());
  });

  it("returns 502 when GitHub token exchange returns 200 with error and access_token", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(
            JSON.stringify({
              error: "bad_verification_code",
              access_token: "should-not-be-used",
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: "GitHub OAuth failed" });
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 502 when GitHub token exchange HTTP status is not ok", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response("bad", { status: 400 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: "GitHub OAuth failed" });
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 502 when GitHub token exchange omits access_token", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 502 when GitHub token exchange body is not JSON", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response("not-json", { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 502 when GitHub token exchange network fetch rejects", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          throw new Error("network down");
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 502 when GitHub token exchange JSON body is null", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response("null", { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(502);
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });

  it("returns 500 when GitHub user fetch fails and logs only the callback event", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({ access_token: "github-access-token" }), {
            status: 200,
          });
        }
        if (url.includes("api.github.com/user")) {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader(nonce) },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "GitHub OAuth failed" });
    expectNonceClearCookie(response.headers.getSetCookie());
    expectCallbackErrorLog(errorSpy);
  });
});
