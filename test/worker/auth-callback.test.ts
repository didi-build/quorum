import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoginOauthState } from "../../src/domain/auth/signing.js";
import worker from "../../src/index";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { oauthLoginNonceCookieHeader } from "./oauth-callback-cookies.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

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

describe("GitHub OAuth callback (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
  });

  it("rejects invalid OAuth state", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/github/callback?code=test-code&state=not-valid"),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it("rejects callback when OAuth nonce cookie is missing or mismatched", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      ),
    );

    const ctx = createExecutionContext();
    const missing = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(missing.status).toBe(400);

    const ctx2 = createExecutionContext();
    const mismatched = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`, {
        headers: { Cookie: oauthLoginNonceCookieHeader("wrong-nonce") },
      }),
      testEnv(),
      ctx2,
    );
    await waitOnExecutionContext(ctx2);
    expect(mismatched.status).toBe(400);
    expect(nonce).not.toBe("wrong-nonce");
  });

  it("returns 502 when GitHub token exchange returns 200 with an error field", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({ error: "bad_verification_code" }), {
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
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: "GitHub OAuth failed" });
  });

  it("returns 502 when GitHub token exchange fails", async () => {
    const { state, nonce } = await createLoginOauthState("test-session-secret");
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
  });
});
