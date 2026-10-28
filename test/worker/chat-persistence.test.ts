import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { resetChatWebSocketRegistry } from "../../src/domain/auth/chat-ws-registry.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
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
      AUTH_ALLOWED_GITHUB_IDS: "1,999030",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

describe("chat persistence and history (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    resetChatWebSocketRegistry();
    mockChatClassifierGreeting();
    await env.DB.prepare("DELETE FROM write_back_proposals").run();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  async function authGet(path: string, rawToken: string): Promise<Response> {
    const cfg = loadConfig(testEnv());
    const request = new Request(`http://test${path}`, {
      headers: {
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return response;
  }

  it("persists messages and returns ordered history with proposals", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999030, "chat-history-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const wsRequest = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const wsCtx = createExecutionContext();
    const wsResponse = await worker.fetch(wsRequest, testEnv(), wsCtx);
    await waitOnExecutionContext(wsCtx);
    expect(wsResponse.status).toBe(101);
    const ws = wsResponse.webSocket!;
    ws.accept();

    const chatResponse = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 5000);
        ws.addEventListener("message", (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
        });
        ws.send(chatWsPayload("Hello"));
      },
    );

    const assistantId = chatResponse.id as string;
    await env.DB.prepare(
      `INSERT INTO write_back_proposals (
        id, chat_message_id, user_id, plan, feedback_history, execution_results
      ) VALUES (?, ?, ?, ?, '[]', '[]')`,
    )
      .bind(
        crypto.randomUUID(),
        assistantId,
        userId,
        JSON.stringify({
          needs_doc_update: false,
          doc_target: null,
          existing_doc_path: null,
          new_doc_slug: null,
          needs_roadmap_item: false,
        }),
      )
      .run();

    const historyResponse = await authGet(
      `/chat/sessions/${encodeURIComponent(TEST_CHAT_SESSION_ID)}/messages`,
      rawToken,
    );
    expect(historyResponse.status).toBe(200);
    const history = (await historyResponse.json()) as {
      session_id: string;
      messages: Array<{
        role: string;
        write_back_proposal: { chat_message_id: string } | null;
      }>;
    };
    expect(history.session_id).toBe(TEST_CHAT_SESSION_ID);
    expect(history.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history.messages[1]?.write_back_proposal?.chat_message_id).toBe(assistantId);
  });
});
