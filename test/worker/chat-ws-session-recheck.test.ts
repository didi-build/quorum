import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as configModule from "../../src/config/index.js";
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
import * as chatWsInbound from "../../src/routes/chat-ws-inbound.js";
import { attachChatWsInboundHandler } from "../../src/routes/chat-ws-inbound.js";
import * as chatWsPipeline from "../../src/routes/chat-ws-pipeline.js";
import {
  CHAT_WS_AUTH_INVALID_CLOSE_REASON,
  CHAT_WS_AUTH_INVALID_CLOSE_CODE,
} from "../../src/routes/chat-ws-inbound.js";
import {
  CHAT_WS_SESSION_RECHECK_INTERVAL_MS,
  chatWsRecheckDue,
  resetChatWsClockForTests,
} from "../../src/routes/chat-ws-recheck.js";
import type { ChatWsInboundDeps } from "../../src/routes/chat-ws-inbound.js";
import type { ChatWsAuthRecheck } from "../../src/routes/chat-ws-recheck.js";
import type { Env } from "../../src/env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";
import {
  chatWsPayload,
  mockChatClassifierGreeting,
  TEST_CHAT_SESSION_ID,
  ensureDefaultBootstrapUser,
} from "./chat-test-helpers.js";
import { actorContext } from "../../src/domain/schemas/actor.js";

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
  content: string,
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
    ws.send(chatWsPayload(content));
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (event) => {
      resolve({ code: event.code, reason: event.reason });
    });
  });
}

type CloseDuringRecheckHandlerOptions = {
  postRecheckClosedGuard: boolean;
  closeListenerClearsQueue: boolean;
};

/** Test-only mirror of attachChatWsInboundHandler with toggles for regression checks. */
function attachChatWsInboundHandlerForCloseTest(
  server: WebSocket,
  env: Env,
  authRecheck: ChatWsAuthRecheck,
  deps: ChatWsInboundDeps,
  handlerOptions: CloseDuringRecheckHandlerOptions,
): void {
  let lastRecheckAtMs = deps.clock.nowMs();
  let recheckInFlight: Promise<boolean> | null = null;
  let socketClosed = false;
  const queue: string[] = [];
  let draining = false;

  function markSocketClosedAndClearQueue(): void {
    socketClosed = true;
    if (handlerOptions.closeListenerClearsQueue) {
      queue.length = 0;
    }
  }

  async function runRecheckIfDue(nowMs: number): Promise<boolean> {
    if (!chatWsRecheckDue(lastRecheckAtMs, nowMs)) {
      return true;
    }
    if (recheckInFlight) {
      return recheckInFlight;
    }
    recheckInFlight = (async () => {
      try {
        let valid: boolean;
        try {
          valid = await deps.recheckAuth(env, authRecheck);
        } catch {
          return false;
        }
        if (valid) {
          lastRecheckAtMs = nowMs;
        }
        return valid;
      } finally {
        recheckInFlight = null;
      }
    })();
    return recheckInFlight;
  }

  async function processOne(text: string): Promise<void> {
    if (socketClosed) {
      return;
    }
    const nowMs = deps.clock.nowMs();
    const stillValid = await runRecheckIfDue(nowMs);
    if (!stillValid) {
      markSocketClosedAndClearQueue();
      chatWsInbound.closeChatWsAuthInvalid(server);
      return;
    }
    if (handlerOptions.postRecheckClosedGuard && socketClosed) {
      return;
    }
    await deps.deliverTurn!(
      { env: testEnv(), config: loadConfig(testEnv()), actor: actorContext("user") },
      text,
      new AbortController().signal,
    );
  }

  async function drainQueue(): Promise<void> {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (queue.length > 0 && !socketClosed) {
        const text = queue.shift()!;
        await processOne(text);
      }
    } finally {
      draining = false;
      if (queue.length > 0 && !socketClosed) {
        void drainQueue();
      }
    }
  }

  if (handlerOptions.closeListenerClearsQueue) {
    server.addEventListener("close", () => {
      markSocketClosedAndClearQueue();
    });
  }

  server.addEventListener("message", (event) => {
    void (async () => {
      if (typeof event.data !== "string") {
        return;
      }
      if (socketClosed) {
        return;
      }
      queue.push(event.data);
      await drainQueue();
    })();
  });
}

async function deliverCountDuringClientCloseWhileRecheckPending(
  handlerOptions: CloseDuringRecheckHandlerOptions,
): Promise<number> {
  let releaseRecheck!: () => void;
  const recheckBlocked = new Promise<boolean>((resolve) => {
    releaseRecheck = () => resolve(true);
  });

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  client.accept();

  const deliverSpy = vi.fn().mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000099",
    session_id: TEST_CHAT_SESSION_ID,
    content: "ok",
    classified_intent: "greeting",
    response_kind: "direct_answer",
    citations: [],
    council_decision: null,
  });
  const deps: ChatWsInboundDeps = {
    clock: { nowMs: () => Date.now() },
    recheckAuth: async () => recheckBlocked,
    deliverTurn: deliverSpy,
  };
  const authRecheck: ChatWsAuthRecheck = {
    sessionToken: "close-during-recheck",
    apiKey: null,
  };
  const handlerContext = {
    env: testEnv(),
    config: loadConfig(testEnv()),
    actor: actorContext("00000000-0000-4000-8000-000000000010"),
  };

  const useProductionHandler =
    handlerOptions.postRecheckClosedGuard && handlerOptions.closeListenerClearsQueue;
  if (useProductionHandler) {
    attachChatWsInboundHandler(server, handlerContext, authRecheck, deps);
  } else {
    attachChatWsInboundHandlerForCloseTest(
      server,
      testEnv(),
      authRecheck,
      deps,
      handlerOptions,
    );
  }

  vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
  client.send(chatWsPayload("in-flight"));
  client.send(chatWsPayload("queued"));

  const serverClosed = new Promise<void>((resolve) => {
    server.addEventListener("close", () => resolve());
  });
  client.close(1000);
  await serverClosed;

  releaseRecheck();
  await vi.runAllTimersAsync();

  const count = deliverSpy.mock.calls.length;
  deliverSpy.mockRestore();
  return count;
}

function collectChatResponses(ws: WebSocket, count: number): Promise<unknown[]> {
  const frames: unknown[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("websocket collect timeout")),
      5000,
    );
    const onMessage = (event: MessageEvent) => {
      frames.push(JSON.parse(String(event.data)));
      if (frames.length >= count) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve(frames);
      }
    };
    ws.addEventListener("message", onMessage);
  });
}

describe("chat WebSocket session re-check (DIDI-889)", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    resetBootstrapApiKeyGuard();
    resetChatWebSocketRegistry();
    resetChatWsClockForTests();
    mockChatClassifierGreeting();
    await ensureDefaultBootstrapUser(env.DB);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetChatWsClockForTests();
  });

  it("uses a 30 second re-check interval constant", () => {
    expect(CHAT_WS_SESSION_RECHECK_INTERVAL_MS).toBe(30_000);
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
      expect(frame.classified_intent).toBe("greeting");
    }
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    await sendAndWaitForEcho(ws, "after-interval");
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it("does not re-check at 29_999 ms but re-checks at 30_000 ms", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999020, "recheck-boundary")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const resolveSpy = vi.spyOn(actorModule, "resolveWebSocketActor");
    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS - 1);
    await sendAndWaitForEcho(ws, "before-boundary");
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await sendAndWaitForEcho(ws, "at-boundary");
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it("runs one resolver call for a 20-frame burst after the interval", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999020, "recheck-burst")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const resolveSpy = vi.spyOn(actorModule, "resolveWebSocketActor");
    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    const expected = Array.from({ length: 20 }, (_, i) => `burst-${i}`);
    const collect = collectChatResponses(ws, 20);
    for (const content of expected) {
      ws.send(chatWsPayload(content));
    }
    const frames = await collect;
    expect(frames).toHaveLength(20);
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it("runs one re-check for two messages in the same 30s window after the first interval", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999020, "recheck-two-msg")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const resolveSpy = vi.spyOn(actorModule, "resolveWebSocketActor");
    const ws = await openSessionChatWebSocket(workerEnv, rawToken);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    await sendAndWaitForEcho(ws, "first-after-interval");
    await sendAndWaitForEcho(ws, "second-after-interval");
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it("closes with 1008 and auth invalid reason on resolver errors and does not deliver", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999021, "recheck-error")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const deliverSpy = vi.spyOn(chatWsPipeline, "deliverChatWsTurn");
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
    const closed = waitForClose(ws);

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("should-not-echo"));

    const closeEvent = await closed;
    expect(closeEvent.code).toBe(CHAT_WS_AUTH_INVALID_CLOSE_CODE);
    expect(closeEvent.reason).toBe(CHAT_WS_AUTH_INVALID_CLOSE_REASON);
    await vi.waitFor(() => {
      expect(deliverSpy).not.toHaveBeenCalled();
    });
  });

  it("closes with 1008 when recheckAuth throws during re-check", async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    attachChatWsInboundHandler(
      server,
      {
        env: testEnv(),
        config: loadConfig(testEnv()),
        actor: actorContext("00000000-0000-4000-8000-000000000011"),
      },
      { sessionToken: "inbound-test-token", apiKey: null },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => {
          throw new Error("recheck auth threw");
        },
      },
    );

    const closed = waitForClose(client);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    client.send(chatWsPayload("after-recheck-throw"));

    const closeEvent = await closed;
    expect(closeEvent.code).toBe(CHAT_WS_AUTH_INVALID_CLOSE_CODE);
    expect(closeEvent.reason).toBe(CHAT_WS_AUTH_INVALID_CLOSE_REASON);
  });

  it("closes with 1008 when loadConfig throws during re-check", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999021, "recheck-config")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(workerEnv, rawToken);
    vi.spyOn(configModule, "loadConfig").mockImplementation(() => {
      throw new Error("config unavailable");
    });
    const closed = waitForClose(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("after-config-fail"));

    const closeEvent = await closed;
    expect(closeEvent.code).toBe(CHAT_WS_AUTH_INVALID_CLOSE_CODE);
    expect(closeEvent.reason).toBe(CHAT_WS_AUTH_INVALID_CLOSE_REASON);
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

    const closed = waitForClose(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("after-revoke"));

    expect((await closed).code).toBe(1008);
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

    const closed = waitForClose(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("after-expire"));

    expect((await closed).code).toBe(1008);
  });

  it("keeps an open session socket when allowlist tightens only for new handshakes", async () => {
    const handshakeEnv = testEnv({ AUTH_ALLOWED_GITHUB_IDS: "1,999024" });
    const cfg = loadConfig(handshakeEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999024, "recheck-allowlist")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ws = await openSessionChatWebSocket(handshakeEnv, rawToken);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    const frame = await sendAndWaitForEcho(ws, "still-on-handshake-env");
    expect(frame.classified_intent).toBe("greeting");

    const restrictedEnv = testEnv({ AUTH_ALLOWED_GITHUB_IDS: "1" });
    const blocked = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const blockedCtx = createExecutionContext();
    const blockedResponse = await worker.fetch(blocked, restrictedEnv, blockedCtx);
    await waitOnExecutionContext(blockedCtx);
    expect(blockedResponse.status).toBe(401);
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

    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    const frame = await sendAndWaitForEcho(ws, "api-with-stale-cookie");
    expect(frame.classified_intent).toBe("greeting");
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
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    const frame = await sendAndWaitForEcho(ws, "still-valid");
    expect(frame.classified_intent).toBe("greeting");
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

    const closed = waitForClose(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("after-key-delete"));

    expect((await closed).code).toBe(1008);
  });

  it("does not deliver a chat turn after a failed re-check", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999026, "recheck-no-process")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const deliverSpy = vi.spyOn(chatWsPipeline, "deliverChatWsTurn");
    const ws = await openSessionChatWebSocket(workerEnv, rawToken);

    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), userId)
      .run();

    const closed = waitForClose(ws);
    vi.advanceTimersByTime(CHAT_WS_SESSION_RECHECK_INTERVAL_MS);
    ws.send(chatWsPayload("must-not-echo"));

    expect((await closed).code).toBe(1008);
    await vi.waitFor(() => {
      expect(deliverSpy).not.toHaveBeenCalled();
    });
  });

  it("does not deliver in-flight or queued frames when the client closes during a pending re-check", async () => {
    const productionDeliveries = await deliverCountDuringClientCloseWhileRecheckPending(
      {
        postRecheckClosedGuard: true,
        closeListenerClearsQueue: true,
      },
    );
    expect(productionDeliveries).toBe(0);

    const withoutPostRecheckGuard =
      await deliverCountDuringClientCloseWhileRecheckPending({
        postRecheckClosedGuard: false,
        closeListenerClearsQueue: true,
      });
    expect(withoutPostRecheckGuard).toBeGreaterThan(0);

    const withoutCloseListener = await deliverCountDuringClientCloseWhileRecheckPending(
      {
        postRecheckClosedGuard: true,
        closeListenerClearsQueue: false,
      },
    );
    expect(withoutCloseListener).toBeGreaterThan(0);
  });
});
