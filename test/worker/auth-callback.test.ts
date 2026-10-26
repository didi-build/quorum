import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoginOauthState } from "../../src/domain/auth/signing.js";
import worker from "../../src/index";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
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
    const state = await createLoginOauthState("test-session-secret");
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
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("http://test/app/");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("quorum_session="))).toBe(true);
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
  });

  it("non-allowlisted user gets display cookie and redirect to not-allowed", async () => {
    const state = await createLoginOauthState("test-session-secret");
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
      new Request(`http://test/auth/github/callback?code=test-code&state=${state}`),
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
});
