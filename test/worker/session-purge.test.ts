import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { purgeExpiredSessions } from "../../src/jobs/session-purge.js";

const USER_ID = "00000000-0000-4000-8000-000000000060";
const NOW = new Date("2026-10-26T12:00:00.000Z");

function daysBeforeNow(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysAfterNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function insertUser(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 60, 'purge-user')`,
  )
    .bind(USER_ID)
    .run();
}

async function insertSession(
  id: string,
  expiresAt: string,
  revokedAt: string | null,
  tokenHash: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, USER_ID, tokenHash, expiresAt, revokedAt)
    .run();
}

async function sessionCount(): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions`).first<{
    c: number;
  }>();
  return row?.c ?? 0;
}

describe("purgeExpiredSessions (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
    await insertUser();
  });

  it("keeps sessions whose effective end is 29 days ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000061",
      daysBeforeNow(29),
      null,
      "hash-29d",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(1);
  });

  it("deletes sessions whose effective end is 31 days ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000062",
      daysBeforeNow(31),
      null,
      "hash-31d",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
  });

  it("deletes revoked-but-not-expired sessions 31 days after revoked_at", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000063",
      daysAfterNow(365),
      daysBeforeNow(31),
      "hash-revoked",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
  });

  it("keeps active sessions that are not expired or revoked", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000064",
      daysAfterNow(7),
      null,
      "hash-active",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(1);
  });

  it("is idempotent when run twice", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000065",
      daysBeforeNow(40),
      null,
      "hash-idempotent",
    );

    const first = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    const second = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(first.totalDeleted).toBe(1);
    expect(second.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(0);
  });

  it("logs only aggregate counts", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000066",
      daysBeforeNow(45),
      null,
      "hash-log",
    );

    const payloads: Record<string, string | number | boolean>[] = [];
    await purgeExpiredSessions(env.DB, {
      now: NOW,
      log: (payload) => payloads.push(payload),
    });

    expect(payloads).toHaveLength(1);
    const entry = payloads[0];
    expect(entry.event).toBe("session_purge_complete");
    expect(entry.total_deleted).toBe(1);
    expect(JSON.stringify(entry)).not.toMatch(/00000000-0000-4000/);
    expect(JSON.stringify(entry)).not.toMatch(/hash-log/);
  });
});
