import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { resetChatWebSocketRegistry } from "../../src/domain/auth/chat-ws-registry.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import type { RouteMessageParams } from "../../src/domain/chat/router.js";
import * as routerModule from "../../src/domain/chat/router.js";
import worker from "../../src/index";
import {
  chatWsPayload,
  mockChatClassifierGreeting,
  TEST_CHAT_SESSION_ID,
} from "./chat-test-helpers.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1,999032",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

describe("chat WebSocket hang-up (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    resetChatWebSocketRegistry();
    mockChatClassifierGreeting();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("aborts an in-flight turn without assistant persistence or outbound send", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999032, "hangup-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    let releaseHang!: () => void;
    const hangGate = new Promise<void>((resolve) => {
      releaseHang = () => resolve();
    });

    vi.spyOn(routerModule, "routeMessage").mockImplementation(
      async (_params: RouteMessageParams) => {
        await hangGate;
        return {
          session_id: TEST_CHAT_SESSION_ID,
          content: "unused",
          classified_intent: "greeting",
          response_kind: "direct_answer",
          citations: [],
          council_decision: null,
        };
      },
    );

    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

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
    const ws = response.webSocket!;
    ws.accept();

    let outboundReceived = false;
    ws.addEventListener("message", () => {
      outboundReceived = true;
    });

    ws.send(chatWsPayload("Review this proposal"));

    await vi.waitFor(async () => {
      const userRow = await env.DB.prepare(
        `SELECT id FROM chat_messages WHERE session_id = ? AND role = 'user'`,
      )
        .bind(TEST_CHAT_SESSION_ID)
        .first();
      expect(userRow).toBeTruthy();
      const assistantCount = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ? AND role = 'assistant'`,
      )
        .bind(TEST_CHAT_SESSION_ID)
        .first<{ c: number }>();
      expect(assistantCount?.c).toBe(0);
    });

    ws.close(1000);

    await vi.waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });
    await waitOnExecutionContext(ctx);

    const roles = await env.DB.prepare(
      `SELECT role FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`,
    )
      .bind(TEST_CHAT_SESSION_ID)
      .all<{ role: string }>();
    expect((roles.results ?? []).map((row) => row.role)).toEqual(["user"]);
    expect(outboundReceived).toBe(false);

    releaseHang();
    abortSpy.mockRestore();
  });
});
