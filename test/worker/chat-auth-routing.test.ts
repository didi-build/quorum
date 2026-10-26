import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      APP_BASE_URL: "http://test",
      WS_ALLOWED_ORIGINS: "http://test",
    }),
  });

describe("chat route auth routing (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  const unauthenticatedCases: Array<{
    label: string;
    path: string;
    headers?: HeadersInit;
  }> = [
    { label: "GET /chat/history", path: "/chat/history" },
    { label: "GET /chat/ws/x", path: "/chat/ws/x" },
    {
      label: "GET /chat with Upgrade websocket",
      path: "/chat",
      headers: { Upgrade: "websocket" },
    },
  ];

  for (const { label, path, headers } of unauthenticatedCases) {
    it(`returns 401 unauthenticated for ${label}`, async () => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`, { headers }),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
    });

    it(`returns 401 for ${label} with bad X-API-Key`, async () => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`, {
          headers: {
            ...(headers ?? {}),
            "X-API-Key": "not-a-valid-key",
          },
        }),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
    });
  }
});
