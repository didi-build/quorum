import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

const MIDDLEWARE_JSON_401 = { detail: "Not authenticated" };

describe("chat route auth routing (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  const unauthenticatedCases: Array<{
    label: string;
    path: string;
    headers?: HeadersInit;
  }> = [
    { label: "GET /chat/history", path: "/chat/history" },
    { label: "GET /chat/ws/x", path: "/chat/ws/x" },
    {
      label: "GET /chat with Upgrade websocket",
      path: "/chat",
      headers: { Upgrade: "websocket" },
    },
  ];

  for (const { label, path, headers } of unauthenticatedCases) {
    it(`returns 401 unauthenticated for ${label}`, async () => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`, { headers }),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(MIDDLEWARE_JSON_401);
    });

    it(`returns 401 for ${label} with bad X-API-Key`, async () => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`, {
          headers: {
            ...(headers ?? {}),
            "X-API-Key": "not-a-valid-key",
          },
        }),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(MIDDLEWARE_JSON_401);
    });
  }

  it("does not treat GET /chat/wsX as the chat WebSocket route", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/wsX", {
        headers: { Upgrade: "websocket" },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(MIDDLEWARE_JSON_401);
  });

  it("returns plain-text 401 from handleChatWebSocket for unauthenticated /chat/ws", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws", {
        headers: { Upgrade: "websocket" },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Not authenticated");
  });

  it("returns plain-text 401 from handleChatWebSocket for unauthenticated /chat/ws/", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws/", {
        headers: { Upgrade: "websocket" },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Not authenticated");
  });

  it("rejects /chat/ws with session cookie and missing Origin", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 1, "ws-origin-user@example.com")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws", {
        headers: {
          Upgrade: "websocket",
          Cookie: `${cfg.sessionCookieName}=${rawToken}`,
        },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Origin not allowed");
  });

  it("rejects non-allowlisted session at /chat/ws", async () => {
    const cfg = loadConfig(
      workerEnvWithSecrets({
        ...env,
        ...withTestConfigEnv({
          APP_BASE_URL: "http://test",
          WS_ALLOWED_ORIGINS: "http://test",
          AUTH_ALLOWED_GITHUB_IDS: "1",
        }),
      }),
    );
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 424242, "deny-ws@example.com")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws", {
        headers: {
          Upgrade: "websocket",
          Origin: "http://test",
          Cookie: `${cfg.sessionCookieName}=${rawToken}`,
        },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Not authenticated");
  });
});
