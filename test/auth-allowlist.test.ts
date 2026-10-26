import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";
import { isGithubIdAllowed } from "../src/domain/auth/allowlist.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("isGithubIdAllowed (unit)", () => {
  it("uses numeric GitHub ids from config", () => {
    const config = loadConfig(withTestConfigEnv({ AUTH_ALLOWED_GITHUB_IDS: "42,100" }));
    expect(isGithubIdAllowed(config, 42)).toBe(true);
    expect(isGithubIdAllowed(config, 100)).toBe(true);
    expect(isGithubIdAllowed(config, 99)).toBe(false);
  });
});
