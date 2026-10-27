import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../../src/lib/token-crypto.js";
import {
  createBrowserSession,
  getOrCreateUser,
} from "../../src/domain/auth/browser-session.js";
import { loadConfig } from "../../src/config/load-config.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { LINEAR_ACCESS_LOST_DETAIL } from "../../src/domain/connections/available-sources.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const CONNECTION_ID = "00000000-0000-4000-8000-000000000088";

function testEnv() {
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "515151",
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
      LINEAR_CLIENT_ID: "test-linear-client-id",
    }),
  });
}

async function authCookie(): Promise<string> {
  const cfg = loadConfig(testEnv());
  const user = await getOrCreateUser(env.DB, 515151, "linear-conn-user");
  const { rawToken } = await createBrowserSession(env.DB, cfg, user.id);
  return `${cfg.sessionCookieName}=${rawToken}`;
}

async function seedLinearConnection(
  userId: string,
  accessToken = "stored-access",
  refreshToken = "stored-refresh",
): Promise<void> {
  const cfg = loadConfig(testEnv());
  const accessCiphertext = await encryptToken(cfg.tokenEncryptionKey, accessToken);
  const refreshCiphertext = await encryptToken(cfg.tokenEncryptionKey, refreshToken);
  await env.DB.prepare(
    `INSERT INTO connections (
      id, user_id, provider, access_token_ciphertext, refresh_token_ciphertext,
      external_account_id, external_account_name
    ) VALUES (?, ?, 'linear', ?, ?, 'linear-user-id', 'Linear User')`,
  )
    .bind(CONNECTION_ID, userId, accessCiphertext, refreshCiphertext)
    .run();
}

describe("Linear connection available sources (worker integration)", () => {
  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    await env.DB.prepare("DELETE FROM knowledge_sources").run();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists teams and marks already-added sources", async () => {
    const user = await getOrCreateUser(env.DB, 515151, "linear-teams-user");
    await seedLinearConnection(user.id);
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'linear', 'team-1', ?, 'Team One', 'ready')`,
    )
      .bind(crypto.randomUUID(), user.id, CONNECTION_ID)
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                teams: {
                  nodes: [
                    { id: "team-1", name: "Team One", key: "ONE" },
                    { id: "team-2", name: "Team Two", key: "TWO" },
                  ],
                  pageInfo: { hasNextPage: false },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${CONNECTION_ID}/available-sources`, {
        headers: { Cookie: await authCookie() },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      external_ref: string;
      already_added: boolean;
      key: string;
    }>;
    expect(body).toHaveLength(2);
    const teamOne = body.find((item) => item.external_ref === "team-1");
    expect(teamOne?.already_added).toBe(true);
    expect(teamOne?.key).toBe("ONE");
    const teamTwo = body.find((item) => item.external_ref === "team-2");
    expect(teamTwo?.already_added).toBe(false);
  });

  it("refreshes access token after Linear returns 401", async () => {
    const user = await getOrCreateUser(env.DB, 515151, "linear-refresh-user");
    await seedLinearConnection(user.id);
    let teamsCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "refreshed-access",
              refresh_token: "refreshed-refresh",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/graphql")) {
          teamsCalls += 1;
          if (teamsCalls === 1) {
            return new Response("unauthorized", { status: 401 });
          }
          return new Response(
            JSON.stringify({
              data: {
                teams: {
                  nodes: [{ id: "team-9", name: "Nine", key: "NINE" }],
                  pageInfo: { hasNextPage: false },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${CONNECTION_ID}/available-sources`, {
        headers: { Cookie: await authCookie() },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(teamsCalls).toBe(2);
    const body = (await response.json()) as Array<{ external_ref: string }>;
    expect(body[0]?.external_ref).toBe("team-9");
  });

  it("maps Linear 403 to reconnect detail", async () => {
    const user = await getOrCreateUser(env.DB, 515151, "linear-403-user");
    await seedLinearConnection(user.id);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${CONNECTION_ID}/available-sources`, {
        headers: { Cookie: await authCookie() },
      }),
      testEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe(LINEAR_ACCESS_LOST_DETAIL);
  });
});
