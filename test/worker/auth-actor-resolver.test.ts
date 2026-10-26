import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { resolveActor } from "../../src/domain/auth/actor.js";
import {
  createBrowserSession,
  hashSessionToken,
} from "../../src/domain/auth/browser-session.js";
import { workerEnvWithSecrets } from "./test-env.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1",
      BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
    }),
  });

describe("resolveActor (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("prefers session cookie over API key", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999001, "session-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const request = new Request("http://example.com/sources", {
      headers: {
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
        "X-API-Key": cfg.bootstrapApiKey,
      },
    });
    const actor = await resolveActor(env.DB, cfg, request);
    expect(actor?.userId).toBe(userId);
  });

  it("treats expired session as unauthenticated", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999005, "expired-user")
      .run();
    const rawToken = "expired-session-token";
    const tokenHash = await hashSessionToken(rawToken);
    const expiredAt = new Date(Date.now() - 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, ".000000Z");
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userId, tokenHash, expiredAt)
      .run();

    const request = new Request("http://example.com/sources", {
      headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
    });
    expect(await resolveActor(env.DB, cfg, request)).toBeNull();
  });

  it("treats revoked session as unauthenticated", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999006, "revoked-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    const revokedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000Z");
    const tokenHash = await hashSessionToken(rawToken);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
      .bind(revokedAt, tokenHash)
      .run();

    const request = new Request("http://example.com/sources", {
      headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
    });
    expect(await resolveActor(env.DB, cfg, request)).toBeNull();
  });

  it("falls back to bootstrap API key", async () => {
    const cfg = loadConfig(testEnv());
    const { ensureBootstrapApiKey } = await import("../../src/domain/auth/api-key.js");
    await ensureBootstrapApiKey(env.DB, cfg);
    const request = new Request("http://example.com/sources", {
      headers: { "X-API-Key": cfg.bootstrapApiKey },
    });
    const actor = await resolveActor(env.DB, cfg, request);
    expect(actor?.userId).toBe(cfg.defaultUserId);
  });

  it("returns null without credentials", async () => {
    const cfg = loadConfig(testEnv());
    const request = new Request("http://example.com/sources");
    expect(await resolveActor(env.DB, cfg, request)).toBeNull();
  });
});

describe("protected API middleware (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("returns 401 for protected paths without credentials", async () => {
    const worker = await import("../../src/index");
    const ctx = createExecutionContext();
    const response = await worker.default.fetch(
      new Request("http://example.com/auth/me"),
      workerEnvWithSecrets({ ...env, ...withTestConfigEnv() }),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});
