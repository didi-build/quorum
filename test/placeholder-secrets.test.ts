import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/index.js";
import { resolveAppEnv } from "../src/config/placeholder-secrets.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("resolveAppEnv (unit)", () => {
  it("treats unset APP_ENV as production", () => {
    expect(resolveAppEnv(undefined)).toBe("production");
    expect(resolveAppEnv("")).toBe("production");
    expect(resolveAppEnv("   ")).toBe("production");
  });
});

describe("loadConfig placeholder rejection (unit)", () => {
  it("rejects .dev.vars.example placeholders outside development", () => {
    expect(() =>
      loadConfig(
        withTestConfigEnv({
          APP_ENV: "production",
          SESSION_SECRET: "dev-session-secret-change-me",
        }),
      ),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig(
        withTestConfigEnv({
          APP_ENV: "production",
          BOOTSTRAP_API_KEY: "dev-api-key-change-me",
        }),
      ),
    ).toThrow(/BOOTSTRAP_API_KEY/);
  });

  it("allows placeholders in development", () => {
    const config = loadConfig(
      withTestConfigEnv({
        APP_ENV: "development",
        SESSION_SECRET: "dev-session-secret-change-me",
        BOOTSTRAP_API_KEY: "dev-api-key-change-me",
      }),
    );
    expect(config.sessionSecret).toBe("dev-session-secret-change-me");
  });

  it("rejects SESSION_TTL_DAYS <= 0", () => {
    expect(() => loadConfig(withTestConfigEnv({ SESSION_TTL_DAYS: "0" }))).toThrow(
      ConfigError,
    );
    expect(() => loadConfig(withTestConfigEnv({ SESSION_TTL_DAYS: "-1" }))).toThrow(
      /SESSION_TTL_DAYS/,
    );
  });

  it("treats unset APP_ENV as production in loaded config", () => {
    const config = loadConfig(withTestConfigEnv({ APP_ENV: undefined }));
    expect(config.appEnv).toBe("production");
  });
});
