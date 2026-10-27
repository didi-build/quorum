import {
  createExecutionContext,
  createScheduledController,
  env,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/index";

const PURGE_DELAY_MS = 200;
const USER_ID = "00000000-0000-4000-8000-000000000082";

function wrapDbWithPurgeDeleteDelay(database: D1Database): D1Database {
  const originalPrepare = database.prepare.bind(database);
  return {
    prepare(sql: string) {
      const statement = originalPrepare(sql);
      if (!sql.includes("DELETE FROM sessions")) {
        return statement;
      }
      return {
        bind: (...args: unknown[]) => {
          const bound = statement.bind(...args);
          return {
            ...bound,
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, PURGE_DELAY_MS));
              return bound.run();
            },
          };
        },
      } as D1PreparedStatement;
    },
    batch: database.batch.bind(database),
    exec: database.exec.bind(database),
  } as D1Database;
}

async function sessionCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM sessions`).first<{
    c: number;
  }>();
  return row?.c ?? 0;
}

describe("Worker scheduled awaits session purge (integration, vitest-pool-workers)", () => {
  let delayedDb: D1Database;

  beforeEach(async () => {
    delayedDb = wrapDbWithPurgeDeleteDelay(env.DB);
    const expiredAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login) VALUES (?, 82, 'scheduled-await-user')`,
    )
      .bind(USER_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES (?, ?, 'hash-scheduled-await', ?)`,
    )
      .bind("00000000-0000-4000-8000-000000000083", USER_ID, expiredAt)
      .run();
  });

  it("awaits purge before scheduled resolves (fails if only waitUntil is used)", async () => {
    const controller = createScheduledController({
      cron: "0 4 * * *",
      scheduledTime: new Date(),
    });
    const ctx = createExecutionContext();
    const started = Date.now();
    await worker.scheduled(controller, { ...env, DB: delayedDb }, ctx);
    const elapsed = Date.now() - started;

    // CI timer resolution/jitter can undershoot setTimeout by a few ms under load.
    expect(elapsed).toBeGreaterThanOrEqual(PURGE_DELAY_MS - 50);
    expect(await sessionCount(env.DB)).toBe(0);
  });
});
