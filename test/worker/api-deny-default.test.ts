import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv(),
  });

describe("deny-by-default /api and /council (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("returns 401 for unauthenticated unknown /api subpaths", async () => {
    for (const path of ["/api/does-not-exist", "/api"]) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ detail: "Not authenticated" });
    }
  });

  it("returns 401 for unauthenticated unknown /council subpaths", async () => {
    for (const path of ["/council/x", "/council"]) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ detail: "Not authenticated" });
    }
  });
});
