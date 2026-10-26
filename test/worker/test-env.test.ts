import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { workerEnvWithSecrets } from "./test-env.js";

describe("workerEnvWithSecrets (unit)", () => {
  it("caller overrides win over default testConfigEnv", () => {
    const merged = workerEnvWithSecrets({
      ...(env as import("../../src/env.js").Env),
      APP_ENV: "production",
      SESSION_SECRET: "caller-session-secret",
    });
    expect(merged.APP_ENV).toBe("production");
    expect(merged.SESSION_SECRET).toBe("caller-session-secret");
  });
});
