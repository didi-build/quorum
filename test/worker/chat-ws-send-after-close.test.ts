import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { attachChatWsInboundHandler } from "../../src/routes/chat-ws-inbound.js";
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

describe("chat WebSocket send after close (worker unit)", () => {
  it("does not deliver a turn after the client closes the socket", async () => {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    client.accept();

    const deliverSpy = vi.fn(async () => ({
      id: "x",
      session_id: "s1",
      content: "late",
      classified_intent: "greeting" as const,
      response_kind: "direct_answer" as const,
      citations: [],
      council_decision: null,
    }));

    attachChatWsInboundHandler(
      server,
      {
        env: testEnv(),
        config: loadConfig(testEnv()),
        actor: actorContext("00000000-0000-4000-8000-000000000027"),
      },
      { sessionToken: null, apiKey: "key" },
      {
        clock: { nowMs: () => Date.now() },
        recheckAuth: async () => true,
        deliverTurn: deliverSpy,
      },
    );

    client.close(1000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    server.dispatchEvent(
      new MessageEvent("message", { data: chatWsPayload("after-close") }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deliverSpy).not.toHaveBeenCalled();
  });
});
