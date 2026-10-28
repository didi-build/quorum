import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import {
  attachChatWsInboundHandler,
  CHAT_WS_AUTH_INVALID_CLOSE_CODE,
  CHAT_WS_INBOUND_QUEUE_MAX,
  CHAT_WS_INVALID_FRAME_CLOSE_CODE,
  CHAT_WS_QUEUE_FULL_CLOSE_REASON,
} from "../../src/routes/chat-ws-inbound.js";
import { deliverChatWsTurn } from "../../src/routes/chat-ws-pipeline.js";
import { CHAT_CONTENT_MAX_BYTES } from "../../src/domain/chat/parse-inbound.js";
import { actorContext } from "../../src/domain/schemas/actor.js";
import { chatWsPayload } from "./chat-test-helpers.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { env } from "cloudflare:test";
import { workerEnvWithSecrets } from "./test-env.js";

function testEnv() {
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1",
      APP_BASE_URL: "http://test",
    }),
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (event) => {
      resolve({ code: event.code, reason: event.reason });
    });
  });
}

describe("chat WebSocket inbound limits (unit)", () => {
  it("closes with 1007 on malformed JSON", async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    const deliverSpy = vi.fn(deliverChatWsTurn);
    attachChatWsInboundHandler(
      server,
      {
        env: testEnv(),
        config: loadConfig(testEnv()),
        actor: actorContext("00000000-0000-4000-8000-000000000020"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: deliverSpy,
      },
    );

    const closed = waitForClose(client);
    client.send("{not-json");
    const event = await closed;
    expect(event.code).toBe(CHAT_WS_INVALID_FRAME_CLOSE_CODE);
    expect(deliverSpy).toHaveBeenCalledTimes(1);
  });

  it("closes with 1007 on invalid session_id and oversized content", async () => {
    const workerEnv = testEnv();
    const cfg = loadConfig(workerEnv);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    attachChatWsInboundHandler(
      server,
      {
        env: workerEnv,
        config: cfg,
        actor: actorContext("00000000-0000-4000-8000-000000000021"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: deliverChatWsTurn,
      },
    );

    client.send(JSON.stringify({ session_id: "bad/id", content: "Hi" }));
    expect((await waitForClose(client)).code).toBe(CHAT_WS_INVALID_FRAME_CLOSE_CODE);

    const pair2 = new WebSocketPair();
    const [client2, server2] = Object.values(pair2);
    server2.accept();
    client2.accept();
    attachChatWsInboundHandler(
      server2,
      {
        env: workerEnv,
        config: cfg,
        actor: actorContext("00000000-0000-4000-8000-000000000022"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: deliverChatWsTurn,
      },
    );
    const big = "a".repeat(CHAT_CONTENT_MAX_BYTES + 1);
    client2.send(JSON.stringify({ session_id: "s1", content: big }));
    expect((await waitForClose(client2)).code).toBe(CHAT_WS_INVALID_FRAME_CLOSE_CODE);
  });

  it("ignores binary frames without calling deliverTurn", async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    const deliverSpy = vi.fn(deliverChatWsTurn);
    attachChatWsInboundHandler(
      server,
      {
        env: testEnv(),
        config: loadConfig(testEnv()),
        actor: actorContext("00000000-0000-4000-8000-000000000024"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: deliverSpy,
      },
    );

    client.send(new Uint8Array([0, 1, 2]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("closes with 1008 when the inbound queue overflows", async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    let releaseTurn!: () => void;
    const turnBlocked = new Promise<void>((resolve) => {
      releaseTurn = () => resolve();
    });

    attachChatWsInboundHandler(
      server,
      {
        env: testEnv(),
        config: loadConfig(testEnv()),
        actor: actorContext("00000000-0000-4000-8000-000000000023"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: async () => {
          await turnBlocked;
          return {
            id: "x",
            session_id: "s1",
            content: "ok",
            classified_intent: "greeting",
            response_kind: "direct_answer",
            citations: [],
            council_decision: null,
          };
        },
      },
    );

    const closed = waitForClose(client);
    for (let i = 0; i < CHAT_WS_INBOUND_QUEUE_MAX + 2; i += 1) {
      client.send(chatWsPayload(`msg-${i}`));
    }
    const event = await closed;
    expect(event.code).toBe(CHAT_WS_AUTH_INVALID_CLOSE_CODE);
    expect(event.reason).toBe(CHAT_WS_QUEUE_FULL_CLOSE_REASON);
    releaseTurn();
  });
});
