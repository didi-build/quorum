import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import worker from "../../src/index";
import { TEST_CHAT_SESSION_ID } from "./chat-test-helpers.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1,999031",
      APP_BASE_URL: "http://test",
    }),
  });

describe("chat history bad request (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  async function authedGet(pathWithQuery: string): Promise<Response> {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999031, "history-400")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    const request = new Request(`http://test${pathWithQuery}`, {
      headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return response;
  }

  it("returns 400 when the cursor does not decode", async () => {
    const response = await authedGet(
      `/chat/sessions/${TEST_CHAT_SESSION_ID}/messages?cursor=bad-cursor`,
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when limit is not an integer or is below 1", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999031, "history-limit-400")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    for (const query of ["limit=abc", "limit=0", "limit=-5"]) {
      const request = new Request(
        `http://test/chat/sessions/${TEST_CHAT_SESSION_ID}/messages?${query}`,
        {
          headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, testEnv(), ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(400);
    }
  });

  it("returns 400 when decodeURIComponent throws on the session id", async () => {
    const response = await authedGet("/chat/sessions/%E0%A4%A/messages");
    expect(response.status).toBe(400);
  });

  it("returns 400 when session_id does not match the allowed pattern", async () => {
    const response = await authedGet("/chat/sessions/bad%2Fid/messages");
    expect(response.status).toBe(400);
  });
});
