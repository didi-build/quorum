import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import * as actorModule from "../../src/domain/auth/actor.js";
import {
  ensureBootstrapApiKey,
  hashApiKey,
  resetBootstrapApiKeyGuard,
} from "../../src/domain/auth/api-key.js";
import { resetChatWebSocketRegistry } from "../../src/domain/auth/chat-ws-registry.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import worker from "../../src/index";
import { CHAT_WS_SESSION_RECHECK_INTERVAL_MS } from "../../src/routes/chat-ws-recheck.js";
import { resetChatWsClockForTests } from "../../src/routes/chat-ws-recheck.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const ALLOWED_GITHUB_IDS = "1,999020,999021,999022,999023,999024,999025,999026,999027";

function testEnv(overrides: Record<string, unknown> = {}) {
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: ALLOWED_GITHUB_IDS,
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
      ...overrides,
    }),
  });
}

async function openSessionChatWebSocket(
  workerEnv: ReturnType<typeof testEnv>,
  rawToken: string,
): Promise<WebSocket> {
  const cfg = loadConfig(workerEnv);
  const request = new Request("http://test/chat/ws", {
    headers: {
      Upgrade: "websocket",
      Origin: "http://test",
      Cookie: `${cfg.sessionCookieName}=${rawToken}`,
    },
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, workerEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  expect(ws).toBeDefined();
  ws!.accept();
  return ws!;
}

function sendAndWaitForEcho(
  ws: WebSocket,
  payload: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("websocket message timeout")),
      5000,
    );
    ws.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
    });
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(event);
    });
    ws.send(payload);
  });
}

function waitForCloseCode(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (event) => {
      resolve(event.code);
    });
  });
}

describe("chat WebSocket session re-check (DIDI-889)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBootstrapApiKeyGuard();
    resetChatWebSocketRegistry();
    resetChatWsClockForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetChatWsClockForTests();
  });

  it("throttles auth re-checks and does not call the resolver on every message", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999020, "recheck-throttle")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const resolveSpy = vi.spyOn(actorModule, "resolveWebSocketActor");

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      const frame = await sendAndWaitForEcho(ws, `ping-${i}`);
      expect(frame.authenticated).toBe(true);
    }
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    await sendAndWaitForEcho(ws, "after-interval");
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it("closes with 1008 on resolver errors and does not echo the message", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999021, "recheck-error")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const originalResolve = actorModule.resolveWebSocketActor;
    let resolveCallCount = 0;
    vi.spyOn(actorModule, "resolveWebSocketActor").mockImplementation(
      async (...args) => {
        resolveCallCount += 1;
        if (resolveCallCount === 1) {
          return originalResolve(...args);
        }
        throw new Error("resolver unavailable");
      },
    );

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    const closed = waitForCloseCode(ws);
    let messageReceived = false;
    ws.addEventListener("message", () => {
      messageReceived = true;
    });

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("should-not-echo");

    expect(await closed).toBe(1008);
    await vi.waitFor(() => {
      expect(messageReceived).toBe(false);
    });
  });

  it("closes with 1008 after interval when the session is revoked", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999022, "recheck-revoked")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    await sendAndWaitForEcho(ws, "before-revoke");

    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), userId)
      .run();

    const closed = waitForCloseCode(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("after-revoke");

    expect(await closed).toBe(1008);
  });

  it("closes with 1008 after interval when the session is expired", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999023, "recheck-expired")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    await sendAndWaitForEcho(ws, "before-expire");

    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .bind(expiredAt, userId)
      .run();

    const closed = waitForCloseCode(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("after-expire");

    expect(await closed).toBe(1008);
  });

  it("closes with 1008 after interval when the user is removed from the allowlist", async () => {
    const workerEnv = testEnv({ AUTH_ALLOWED_GITHUB_IDS: "1,999024" });
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999024, "recheck-allowlist")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    await sendAndWaitForEcho(ws, "before-allowlist");

    workerEnv.AUTH_ALLOWED_GITHUB_IDS = "1";

    const closed = waitForCloseCode(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("after-allowlist");

    expect(await closed).toBe(1008);
  });

  it("keeps API-key auth when a stale session cookie is present across re-check", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    await ensureBootstrapApiKey(env.DB, cfg);

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        "X-API-Key": cfg.bootstrapApiKey,
        Cookie: `${cfg.sessionCookieName}=stale-session-token-not-in-d1`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, workerEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    ws.accept();

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    const frame = await sendAndWaitForEcho(ws, "api-with-stale-cookie");
    expect(frame.authenticated).toBe(true);
    expect(frame.echo).toBe("api-with-stale-cookie");
  });

  it("keeps echoing when the session stays valid across the re-check interval", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999025, "recheck-valid")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    const frame = await sendAndWaitForEcho(ws, "still-valid");
    expect(frame.authenticated).toBe(true);
    expect(frame.echo).toBe("still-valid");
  });

  it("closes API-key WebSockets with 1008 when the key row is removed", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    await ensureBootstrapApiKey(env.DB, cfg);

    const request = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        "X-API-Key": cfg.bootstrapApiKey,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, workerEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    ws.accept();
    await sendAndWaitForEcho(ws, "bootstrap-ok");

    await env.DB.prepare("DELETE FROM api_keys WHERE key_hash = ?")
      .bind(await hashApiKey(cfg.bootstrapApiKey))
      .run();

    const closed = waitForCloseCode(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("after-key-delete");

    expect(await closed).toBe(1008);
  });

  it("does not process a message after a failed re-check", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999026, "recheck-no-process")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);

    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), userId)
      .run();

    const closed = waitForCloseCode(ws);
    let messagesAfterRevoke = 0;
    ws.addEventListener("message", () => {
      messagesAfterRevoke += 1;
    });

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS + 1);
    ws.send("must-not-echo");

    expect(await closed).toBe(1008);
    await vi.waitFor(() => {
      expect(messagesAfterRevoke).toBe(0);
    });
  });
});
