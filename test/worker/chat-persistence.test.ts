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
      AUTH_ALLOWED_GITHUB_IDS: "1,999030,999031",
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

  async function authGet(path: string, rawToken: string | null): Promise<Response> {
    const cfg = loadConfig(testEnv());
    const headers: Record<string, string> = {};
    if (rawToken !== null) {
      headers.Cookie = `${cfg.sessionCookieName}=${rawToken}`;
    }
    const request = new Request(`http://test${path}`, { headers });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return response;
  }

  it("persists messages and returns ordered history with proposals", async () => {
    const sampleCitations = [
      {
        document_id: "00000000-0000-4000-8000-000000000090",
        chunk_index: 0,
        knowledge_source_id: "00000000-0000-4000-8000-000000000091",
        excerpt: "Fixture excerpt",
      },
    ];
    const sampleCouncil = {
      persona_opinions: [],
      overall_verdict: "comment" as const,
      synthesis: "Fixture synthesis",
    };

    vi.spyOn(routerModule, "routeMessage").mockImplementation(
      async (params: RouteMessageParams) => ({
        session_id: params.sessionId,
        content: "Answer with citations",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: sampleCitations,
        council_decision: sampleCouncil,
      }),
    );

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
      next_cursor: string | null;
      messages: Array<{
        role: string;
        classified_intent: string | null;
        response_kind: string | null;
        citations: unknown[];
        council_decision: unknown | null;
        write_back_proposal: { chat_message_id: string } | null;
      }>;
    };
    expect(history.session_id).toBe(TEST_CHAT_SESSION_ID);
    expect(history.next_cursor).toBeNull();
    expect(history.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history.messages[0]?.classified_intent).toBe("greeting");
    expect(history.messages[1]?.classified_intent).toBe("greeting");
    expect(history.messages[1]?.response_kind).toBe("direct_answer");
    expect(history.messages[1]?.citations).toEqual(sampleCitations);
    expect(history.messages[1]?.council_decision).toEqual(sampleCouncil);
    expect(history.messages[1]?.write_back_proposal?.chat_message_id).toBe(assistantId);
  });

  it("returns 401 for unauthenticated history", async () => {
    const response = await authGet(
      `/chat/sessions/${encodeURIComponent(TEST_CHAT_SESSION_ID)}/messages`,
      null,
    );
    expect(response.status).toBe(401);
  });

  it("returns an empty list for another user's session", async () => {
    const cfg = loadConfig(testEnv());
    const ownerId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(ownerId, 999030, "owner")
      .run();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(otherId, 999031, "other")
      .run();
    await env.DB.prepare(
      `INSERT INTO chat_messages (
        id, session_id, user_id, role, content, citations
      ) VALUES (?, ?, ?, 'user', 'secret', '[]')`,
    )
      .bind(crypto.randomUUID(), TEST_CHAT_SESSION_ID, ownerId)
      .run();

    const { rawToken: otherToken } = await createBrowserSession(env.DB, cfg, otherId);
    const response = await authGet(
      `/chat/sessions/${encodeURIComponent(TEST_CHAT_SESSION_ID)}/messages`,
      otherToken,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });
});
