import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { purgeExpiredSessions } from "../../src/jobs/session-purge.js";

const USER_ID = "00000000-0000-4000-8000-000000000060";
const NOW = new Date("2026-10-26T12:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBeforeNow(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

function daysAfterNow(days: number): string {
  return new Date(NOW.getTime() + days * MS_PER_DAY).toISOString();
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

  it("keeps sessions whose effective end is exactly 30 days ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000067",
      new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
      null,
      "hash-30d",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(1);
  });

  it("deletes sessions whose effective end is 30 days and 1 ms ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000068",
      new Date(NOW.getTime() - 30 * MS_PER_DAY - 1).toISOString(),
      null,
      "hash-30d-1ms",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
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

  it("keeps sessions when revoked_at is exactly 30 days ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000071",
      daysAfterNow(365),
      new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
      "hash-revoked-30d",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(1);
  });

  it("deletes sessions when revoked_at is 30 days and 1 ms ago", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000072",
      daysAfterNow(365),
      new Date(NOW.getTime() - 30 * MS_PER_DAY - 1).toISOString(),
      "hash-revoked-30d-1ms",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
  });

  it("skips and counts rows with malformed revoked_at", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000073",
      daysBeforeNow(40),
      "not-an-iso-timestamp",
      "hash-bad-revoked",
    );

    const payloads: Record<string, string | number | boolean>[] = [];
    const result = await purgeExpiredSessions(env.DB, {
      now: NOW,
      log: (payload) => payloads.push(payload),
    });

    expect(result.totalDeleted).toBe(0);
    expect(result.malformedTimestampSkipped).toBe(1);
    expect(await sessionCount()).toBe(1);
    expect(payloads[0]?.malformed_timestamp_skipped).toBe(1);
  });

  it("deletes eligible rows across multiple batches", async () => {
    for (let i = 0; i < 3; i += 1) {
      await insertSession(
        `00000000-0000-4000-8000-00000000008${i}`,
        daysBeforeNow(45 + i),
        null,
        `hash-multi-${i}`,
      );
    }

    const result = await purgeExpiredSessions(env.DB, {
      now: NOW,
      batchSize: 2,
      log: () => {},
    });

    expect(result.totalDeleted).toBe(3);
    expect(result.batches).toBe(2);
    expect(result.capped).toBe(false);
    expect(await sessionCount()).toBe(0);
  });

  it("stops at maxBatches and reports capped", async () => {
    for (let i = 0; i < 4; i += 1) {
      await insertSession(
        `00000000-0000-4000-8000-00000000009${i}`,
        daysBeforeNow(50 + i),
        null,
        `hash-cap-${i}`,
      );
    }

    const result = await purgeExpiredSessions(env.DB, {
      now: NOW,
      batchSize: 2,
      maxBatches: 1,
      log: () => {},
    });

    expect(result.totalDeleted).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.capped).toBe(true);
    expect(await sessionCount()).toBe(2);
  });

  it("does not purge rows with non-ISO timestamp shapes", async () => {
    await insertSession(
      "00000000-0000-4000-8000-000000000069",
      "2020-01-01 00:00:00",
      null,
      "hash-space-ts",
    );
    await insertSession(
      "00000000-0000-4000-8000-000000000070",
      "1735689600",
      null,
      "hash-epoch",
    );

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(result.malformedTimestampSkipped).toBe(2);
    expect(await sessionCount()).toBe(2);
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
    expect(entry.malformed_timestamp_skipped).toBe(0);
    expect(JSON.stringify(entry)).not.toMatch(/00000000-0000-4000/);
    expect(JSON.stringify(entry)).not.toMatch(/hash-log/);
  });
});
