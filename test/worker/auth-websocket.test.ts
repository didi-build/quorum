import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import {
  createBrowserSession,
  hashSessionToken,
} from "../../src/domain/auth/browser-session.js";
import { ensureBootstrapApiKey } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { CHAT_WS_PROBE_ECHO_MAX_BYTES } from "../../src/routes/chat-ws.js";
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

  it("rejects expired session", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999007, "expired-ws")
      .run();
    const rawToken = "expired-ws-token";
    const tokenHash = await hashSessionToken(rawToken);
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userId, tokenHash, expiredAt)
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

  it("rejects revoked session", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999003, "revoked-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), userId)
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

  it("probe echo omits user_id and caps UTF-8 payload at 4096 bytes", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999010, "echo-user")
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
    const ws = response.webSocket;
    expect(ws).toBeDefined();
    ws!.accept();

    const overLimit = "a".repeat(CHAT_WS_PROBE_ECHO_MAX_BYTES - 3) + "😀extra";
    const frame = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("websocket message timeout")),
        5000,
      );
      ws!.addEventListener("message", (event) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      });
      ws!.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(event);
      });
      ws!.send(overLimit);
    });

    expect(frame.authenticated).toBe(true);
    expect(frame).not.toHaveProperty("user_id");
    expect(typeof frame.echo).toBe("string");
    expect(
      new TextEncoder().encode(frame.echo as string).byteLength,
    ).toBeLessThanOrEqual(CHAT_WS_PROBE_ECHO_MAX_BYTES);
    expect(frame.echo).toBe("a".repeat(CHAT_WS_PROBE_ECHO_MAX_BYTES - 3));
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
