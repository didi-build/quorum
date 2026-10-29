import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import { HISTORY_MAX_LIMIT } from "../../src/domain/chat/service.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const SESSION_ID = "paginated-session-001";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1,999031",
      APP_BASE_URL: "http://test",
    }),
  });

describe("chat history pagination (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  async function seedMessages(userId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      const createdAt = `2026-01-01T00:00:${String(i).padStart(3, "0")}.000Z`;
      await env.DB.prepare(
        `INSERT INTO chat_messages (
          id, session_id, user_id, role, content, citations, created_at
        ) VALUES (?, ?, ?, 'user', ?, '[]', ?)`,
      )
        .bind(crypto.randomUUID(), SESSION_ID, userId, `m-${i}`, createdAt)
        .run();
    }
  }

  it("pages 150 messages with all 200s, full order, and no duplicates", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999031, "pager")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    await seedMessages(userId, 150);

    const allContents: string[] = [];
    const allIds = new Set<string>();

    let cursor: string | null = null;
    for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
      const query = new URLSearchParams({ limit: String(HISTORY_MAX_LIMIT) });
      if (cursor !== null) {
        query.set("cursor", cursor);
      }
      const request = new Request(
        `http://test/chat/sessions/${SESSION_ID}/messages?${query.toString()}`,
        {
          headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, testEnv(), ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        messages: Array<{ id: string; content: string }>;
        next_cursor: string | null;
      };
      for (const message of body.messages) {
        expect(allIds.has(message.id)).toBe(false);
        allIds.add(message.id);
        allContents.push(message.content);
      }
      cursor = body.next_cursor;
      if (pageIndex === 0) {
        expect(body.messages).toHaveLength(100);
        expect(cursor).not.toBeNull();
      } else {
        expect(body.messages).toHaveLength(50);
        expect(cursor).toBeNull();
      }
    }

    expect(allContents).toHaveLength(150);
    expect(allContents[0]).toBe("m-0");
    expect(allContents[149]).toBe("m-149");
  });

  it("clamps limit=1000 to 100 messages per page", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999031, "pager-limit-clamp")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    await seedMessages(userId, 120);

    const request = new Request(
      `http://test/chat/sessions/${SESSION_ID}/messages?limit=1000`,
      {
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      },
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      messages: unknown[];
      next_cursor: string | null;
    };
    expect(body.messages).toHaveLength(100);
    expect(body.next_cursor).not.toBeNull();
  });
});
