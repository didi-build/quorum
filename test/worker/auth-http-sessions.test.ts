import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import { resetChatWebSocketRegistry } from "../../src/domain/auth/chat-ws-registry.js";
import {
  createBrowserSession,
  hashSessionToken,
} from "../../src/domain/auth/browser-session.js";
import { clearSessionCookieHeader } from "../../src/domain/auth/cookies.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1,999010,999011,999012",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

describe("HTTP session auth (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
    resetChatWebSocketRegistry();
  });

  it("returns 401 for /auth/me with expired session cookie", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999010, "expired-http")
      .run();
    const rawToken = "expired-http-token";
    const tokenHash = await hashSessionToken(rawToken);
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userId, tokenHash, expiredAt)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/me", {
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("returns 401 for /auth/me with revoked session cookie", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999011, "revoked-http")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), userId)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/me", {
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("clears session cookie on 401 when GitHub id is no longer allowlisted", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 424242, "deny-http@example.com")
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
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toContain(clearSessionCookieHeader(cfg));
  });

  it("POST /auth/logout closes open chat WebSockets for the session", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 1, "ws-logout-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const wsRequest = new Request("http://test/chat/ws", {
      headers: {
        Upgrade: "websocket",
        Origin: "http://test",
        Cookie: `${cfg.sessionCookieName}=${rawToken}`,
      },
    });
    const wsCtx = createExecutionContext();
    const wsResponse = await worker.fetch(wsRequest, testEnv(), wsCtx);
    await waitOnExecutionContext(wsCtx);
    expect(wsResponse.status).toBe(101);
    const ws = wsResponse.webSocket;
    expect(ws).toBeDefined();
    ws!.accept();

    const closed = new Promise<number>((resolve) => {
      ws!.addEventListener("close", (event) => {
        resolve(event.code);
      });
    });

    const logoutCtx = createExecutionContext();
    const logoutResponse = await worker.fetch(
      new Request("http://test/auth/logout", {
        method: "POST",
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      }),
      testEnv(),
      logoutCtx,
    );
    await waitOnExecutionContext(logoutCtx);
    expect(logoutResponse.status).toBe(204);
    expect(await closed).toBe(1000);
  });

  it("POST /auth/logout revokes the session row", async () => {
    const cfg = loadConfig(testEnv());
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
      .bind(userId, 999012, "logout-user")
      .run();
    const { rawToken } = await createBrowserSession(env.DB, cfg, userId);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/auth/logout", {
        method: "POST",
        headers: { Cookie: `${cfg.sessionCookieName}=${rawToken}` },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);

    const row = await env.DB.prepare(
      "SELECT revoked_at FROM sessions WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ revoked_at: string | null }>();
    expect(row?.revoked_at).not.toBeNull();
  });
});
