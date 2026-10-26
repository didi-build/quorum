import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

describe("bootstrap API key insert (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("handles concurrent first /ready calls without 500 or 503", async () => {
    const testEnv = workerEnvWithSecrets({
      ...env,
      ...withTestConfigEnv({ APP_BASE_URL: "http://test" }),
    });

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => {
        const ctx = createExecutionContext();
        return worker
          .fetch(new Request("http://test/ready"), testEnv, ctx)
          .then(async (response) => {
            await waitOnExecutionContext(ctx);
            return response;
          });
      }),
    );

    for (const response of responses) {
      expect(response.status).not.toBe(500);
      expect(response.status).not.toBe(503);
    }
  });
});
