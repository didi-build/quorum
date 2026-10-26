import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/index";

const USER_ID = "00000000-0000-4000-8000-000000000080";

describe("Worker scheduled session purge (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    const expiredAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login) VALUES (?, 80, 'scheduled-purge-user')`,
    )
      .bind(USER_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES (?, ?, 'hash-scheduled', ?)`,
    )
      .bind("00000000-0000-4000-8000-000000000081", USER_ID, expiredAt)
      .run();
  });

  it("purges eligible sessions via default.scheduled", async () => {
    const controller = createScheduledController({
      cron: "0 4 * * *",
      scheduledTime: new Date(),
    });
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions`).first<{
      c: number;
    }>();
    expect(row?.c).toBe(0);
  });

  it("awaits purge before scheduled resolves without waitOnExecutionContext", async () => {
    const controller = createScheduledController({
      cron: "0 4 * * *",
      scheduledTime: new Date(),
    });
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);

    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions`).first<{
      c: number;
    }>();
    expect(row?.c).toBe(0);
  });
});
