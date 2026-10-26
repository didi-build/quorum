import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashApiKey } from "../../src/domain/auth/api-key.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import {
  effectiveAppEnv,
  workerEnvWithoutAppEnv,
  workerEnvWithSecrets,
} from "./test-env.js";

const DEV_BOOTSTRAP = "dev-api-key-change-me";

describe("default bootstrap key rejected outside development (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("does not authenticate dev-api-key-change-me on /sources when APP_ENV is production", async () => {
    const bindings = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({ APP_ENV: "production" }),
    });
    expect(effectiveAppEnv(bindings)).toBe("production");

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        headers: { "X-API-Key": DEV_BOOTSTRAP },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("returns 503 for /sources when BOOTSTRAP_API_KEY is missing", async () => {
    const broken = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({ APP_ENV: "production" }),
    });
    delete broken.BOOTSTRAP_API_KEY;

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        headers: { "X-API-Key": DEV_BOOTSTRAP },
      }),
      broken,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(503);
  });

  it("does not authenticate dev-api-key-change-me on /chat/ws after a stale row exists", async () => {
    const prodEnv = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({ APP_ENV: "production" }),
    });
    expect(effectiveAppEnv(prodEnv)).toBe("production");

    const staleHash = await hashApiKey(DEV_BOOTSTRAP);
    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
    )
      .bind(crypto.randomUUID(), staleHash)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws", {
        headers: {
          Upgrade: "websocket",
          "X-API-Key": DEV_BOOTSTRAP,
        },
      }),
      prodEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("rejects dev-api-key-change-me on /sources when APP_ENV is unset (fail closed)", async () => {
    const bindings = workerEnvWithoutAppEnv({
      ...env,
      ...withTestConfigEnv(),
    });
    expect(effectiveAppEnv(bindings)).toBe("production");

    const staleHash = await hashApiKey(DEV_BOOTSTRAP);
    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
    )
      .bind(crypto.randomUUID(), staleHash)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/sources", {
        headers: { "X-API-Key": DEV_BOOTSTRAP },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("rejects dev-api-key-change-me on /chat/ws when APP_ENV is unset (fail closed)", async () => {
    const bindings = workerEnvWithoutAppEnv({
      ...env,
      ...withTestConfigEnv(),
    });
    expect(effectiveAppEnv(bindings)).toBe("production");

    const staleHash = await hashApiKey(DEV_BOOTSTRAP);
    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_hash, user_id, project_id) VALUES (?, ?, NULL, NULL)",
    )
      .bind(crypto.randomUUID(), staleHash)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("http://test/chat/ws", {
        headers: {
          Upgrade: "websocket",
          "X-API-Key": DEV_BOOTSTRAP,
        },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});
