import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

describe("public auth routes and config (worker integration)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 on public auth path when config is invalid", async () => {
    const broken = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv(),
    });
    delete broken.SESSION_SECRET;
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/access-denied"),
      broken,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      detail: expect.stringContaining("SESSION_SECRET"),
    });
  });

  it("sets Secure on session cookie in production config", async () => {
    const prodEnv = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({ APP_ENV: "production" }),
    });
    const { createLoginOauthState } = await import("../../src/domain/auth/signing.js");
    const state = await createLoginOauthState(prodEnv.SESSION_SECRET as string);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
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
      new Request(`http://test/auth/github/callback?code=c&state=${state}`),
      workerEnvWithSecrets({
        ...prodEnv,
        ...withTestConfigEnv({
          APP_ENV: "production",
          AUTH_ALLOWED_GITHUB_IDS: "12345",
          APP_BASE_URL: "http://test",
        }),
      }),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith("quorum_session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("Secure");
  });
});
