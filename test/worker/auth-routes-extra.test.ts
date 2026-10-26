import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { createBrowserSession } from "../../src/domain/auth/browser-session.js";
import {
  clearAuthDisplayCookieHeader,
  clearSessionCookieHeader,
} from "../../src/domain/auth/cookies.js";
import {
  createAuthDisplayValue,
  createLoginOauthState,
} from "../../src/domain/auth/signing.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
      AUTH_ALLOWED_GITHUB_IDS: "12345",
    }),
  });

describe("auth routes (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /auth/me returns login and github_id for a valid session", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 12345, "didi")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/me", {
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ login: "didi", github_id: 12345 });
  });

  it("GET /auth/access-denied returns the display handle", async () => {
    const cfg = loadConfig(testEnv());
    const signed = await createAuthDisplayValue(cfg.sessionSecret, "stranger");

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/access-denied", {
        headers: { Cookie: `${cfg.authDisplayCookieName}=${signed}` },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ login: "stranger" });
  });

  it("rejects expired login OAuth state without setting session cookie", async () => {
    const cfg = loadConfig(testEnv());
    const state = await createLoginOauthState(cfg.sessionSecret, 1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/auth/github/callback?code=c&state=${state}`),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    vi.restoreAllMocks();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${cfg.sessionCookieName}=`))).toBe(false);
    expect(cookies.some((c) => c === clearSessionCookieHeader(cfg))).toBe(false);
    expect(cookies.some((c) => c === clearAuthDisplayCookieHeader(cfg))).toBe(false);
  });

  it("POST /auth/logout clears session and display cookies with Secure", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 12345, "logout-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    const signed = await createAuthDisplayValue(cfg.sessionSecret, "logout-user");

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/logout", {
        method: "POST",
        headers: {
          Cookie: `${cfg.sessionCookieName}=${rawToken}; ${cfg.authDisplayCookieName}=${signed}`,
        },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(204);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toContain(clearSessionCookieHeader(cfg));
    expect(cookies).toContain(clearAuthDisplayCookieHeader(cfg));
    expect(cookies.every((c) => c.includes("Secure"))).toBe(true);
  });
});
