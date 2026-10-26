import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import {
  createBrowserSession,
  getOrCreateUser,
  revokeBrowserSession,
} from "../../src/domain/auth/browser-session.js";
import {
  purgeExpiredSessions,
  SESSION_TIMESTAMP_ISO_GLOB,
} from "../../src/jobs/session-purge.js";
import { isoFrom } from "../../src/lib/time.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function testConfig() {
  return loadConfig(
    workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv(),
    }),
  );
}

async function sessionCount(): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions`).first<{
    c: number;
  }>();
  return row?.c ?? 0;
}

async function expectTimestampMatchesPurgeGlob(
  column: "expires_at" | "revoked_at",
  sessionId: string,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT ${column} AS value FROM sessions WHERE id = ?`,
  )
    .bind(sessionId)
    .first<{ value: string | null }>();
  expect(row?.value).toBeTruthy();
  const globRow = await env.DB.prepare(`SELECT 1 AS ok WHERE ? GLOB ?`)
    .bind(row!.value, SESSION_TIMESTAMP_ISO_GLOB)
    .first<{ ok: number }>();
  expect(globRow?.ok).toBe(1);
}

describe("purgeExpiredSessions with auth-written sessions (DIDI-772 + DIDI-813)", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("writes expires_at and revoked_at matching the purge ISO GLOB from auth helpers", async () => {
    const config = testConfig();
    const user = await getOrCreateUser(env.DB, 77204, "purge-glob");
    const { sessionId, rawToken } = await createBrowserSession(env.DB, config, user.id);
    await expectTimestampMatchesPurgeGlob("expires_at", sessionId);
    await revokeBrowserSession(env.DB, rawToken);
    await expectTimestampMatchesPurgeGlob("revoked_at", sessionId);
  });

  it("deletes a session created by createBrowserSession when effective end is 30 days and 1 ms ago", async () => {
    const config = testConfig();
    const user = await getOrCreateUser(env.DB, 77201, "purge-auth");
    const { sessionId } = await createBrowserSession(env.DB, config, user.id);
    await expectTimestampMatchesPurgeGlob("expires_at", sessionId);

    const effectiveEnd = new Date(NOW.getTime() - 30 * MS_PER_DAY - 1);
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(isoFrom(effectiveEnd), sessionId)
      .run();

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
  });

  it("deletes a revoked session when revoked_at is 30 days and 1 ms ago", async () => {
    const config = testConfig();
    const user = await getOrCreateUser(env.DB, 77202, "purge-revoked");
    const { sessionId } = await createBrowserSession(env.DB, config, user.id);

    const revokedAt = new Date(NOW.getTime() - 30 * MS_PER_DAY - 1);
    const futureExpiry = new Date(NOW.getTime() + 365 * MS_PER_DAY);
    await env.DB.prepare(
      "UPDATE sessions SET revoked_at = ?, expires_at = ? WHERE id = ?",
    )
      .bind(isoFrom(revokedAt), isoFrom(futureExpiry), sessionId)
      .run();

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(1);
    expect(await sessionCount()).toBe(0);
  });

  it("keeps a session created by createBrowserSession when effective end is exactly 30 days ago", async () => {
    const config = testConfig();
    const user = await getOrCreateUser(env.DB, 77203, "purge-keep");
    const { sessionId } = await createBrowserSession(env.DB, config, user.id);

    const effectiveEnd = new Date(NOW.getTime() - 30 * MS_PER_DAY);
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(isoFrom(effectiveEnd), sessionId)
      .run();

    const result = await purgeExpiredSessions(env.DB, { now: NOW, log: () => {} });
    expect(result.totalDeleted).toBe(0);
    expect(await sessionCount()).toBe(1);
  });
});
