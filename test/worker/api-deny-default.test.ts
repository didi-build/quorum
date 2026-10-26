import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actor from "../../src/domain/auth/actor.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import worker from "../../src/index";
import * as chatWs from "../../src/routes/chat-ws.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv(),
  });

const JSON_401_BODY = { detail: "Not authenticated" };

async function expectCanonicalDenyDefault401(path: string): Promise<void> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`http://test${path}`),
    testEnv(),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual(JSON_401_BODY);
}

describe("deny-by-default /api and /council (worker integration)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns exact 401 for canonical unauthenticated /api paths", async () => {
    for (const path of [
      "/api/does-not-exist",
      "/api",
      "/api/",
      "/api/x/",
      "/api?x=1",
      "/api//",
    ]) {
      await expectCanonicalDenyDefault401(path);
    }
  });

  it("returns exact 401 for canonical unauthenticated /council paths", async () => {
    for (const path of ["/council/x", "/council", "/council/", "/council?z"]) {
      await expectCanonicalDenyDefault401(path);
    }
  });

  it("returns 404 from assets without invoking protected handlers for non-canonical paths", async () => {
    const resolveSpy = vi.spyOn(actor, "resolveActor");
    const wsSpy = vi.spyOn(chatWs, "handleChatWebSocket");

    for (const path of ["/API/x", "/%61pi/x", "/api%2Fx", "//api/x", "/api;x"]) {
      resolveSpy.mockClear();
      wsSpy.mockClear();

      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test${path}`),
        testEnv(),
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      expect(resolveSpy).not.toHaveBeenCalled();
      expect(wsSpy).not.toHaveBeenCalled();
    }
  });
});
