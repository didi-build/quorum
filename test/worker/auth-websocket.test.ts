import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import { ensureBootstrapApiKey } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

describe("chat WebSocket auth (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("accepts session cookie with allowed Origin", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999002, "ws-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
  });

  it("rejects missing credentials", async () => {
    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("rejects revoked session", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999003, "revoked-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString().replace(/\.\d{3}Z$/, ".000000Z"), userId)
      .run();

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("rejects session cookie from disallowed Origin", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999004, "origin-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://evil.example",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
  });

  it("accepts API key without Origin", async () => {
    const cfg = loadConfig(testEnv());
    await ensureBootstrapApiKey(env.DB, cfg);

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        "X-API-Key": cfg.bootstrapApiKey,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(101);
  });
});
