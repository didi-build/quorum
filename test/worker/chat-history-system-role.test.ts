import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const SESSION_ID = "system-filter-session";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1,999031",
      APP_BASE_URL: "http://test",
    }),
  });

describe("chat history system role filter (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("skips system rows in SQL and paginates user-visible messages", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999031, "system-filter")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const rows: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }> = [];
    for (let i = 0; i < 105; i += 1) {
      const createdAt = `2026-02-01T00:00:${String(i).padStart(3, "0")}.000Z`;
      rows.push({
        id: crypto.randomUUID(),
        role: "user",
        content: `visible-${i}`,
        createdAt,
      });
      if (i === 50) {
        rows.push({
          id: crypto.randomUUID(),
          role: "system",
          content: "hidden-system",
          createdAt: `2026-02-01T00:00:${String(i).padStart(3, "0")}.500Z`,
        });
      }
    }

    for (const row of rows) {
      await env.DB.prepare(
        `INSERT INTO chat_messages (
          id, session_id, user_id, role, content, citations, created_at
        ) VALUES (?, ?, ?, ?, ?, '[]', ?)`,
      )
        .bind(row.id, SESSION_ID, userId, row.role, row.content, row.createdAt)
        .run();
    }

    const page1Request = new Request(
      `http://test/chat/sessions/${SESSION_ID}/messages?limit=100`,
      { headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` } },
    );
    const ctx1 = createExecutionContext();
    const page1 = await worker.fetch(page1Request, testEnv(), ctx1);
    await waitOnExecutionContext(ctx1);
    expect(page1.status).toBe(200);
    const body1 = (await page1.json()) as {
      messages: Array<{ content: string; role: string }>;
      next_cursor: string | null;
    };
    expect(body1.messages).toHaveLength(100);
    expect(body1.messages.every((m) => m.role === "user")).toBe(true);
    expect(body1.messages.some((m) => m.content.includes("hidden"))).toBe(false);
    expect(body1.next_cursor).not.toBeNull();

    const page2Request = new Request(
      `http://test/chat/sessions/${SESSION_ID}/messages?limit=100&cursor=${encodeURIComponent(body1.next_cursor!)}`,
      { headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` } },
    );
    const ctx2 = createExecutionContext();
    const page2 = await worker.fetch(page2Request, testEnv(), ctx2);
    await waitOnExecutionContext(ctx2);
    expect(page2.status).toBe(200);
    const body2 = (await page2.json()) as {
      messages: Array<{ content: string }>;
      next_cursor: string | null;
    };
    expect(body2.messages).toHaveLength(5);
    expect(body2.next_cursor).toBeNull();

    const allVisible = [...body1.messages, ...body2.messages].map((m) => m.content);
    expect(allVisible[0]).toBe("visible-0");
    expect(allVisible[99]).toBe("visible-99");
    expect(allVisible[100]).toBe("visible-100");
    expect(allVisible).toHaveLength(105);
  });
});
