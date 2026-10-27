import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/config/errors.js";
import {
  DEFAULT_VOYAGE_BASE_URL,
  resolveVoyageBaseUrl,
} from "../src/config/voyage-base-url.js";
import { loadConfig } from "../src/config/load-config.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("resolveVoyageBaseUrl", () => {
  it("defaults when empty", () => {
    expect(resolveVoyageBaseUrl("")).toBe(DEFAULT_VOYAGE_BASE_URL);
    expect(resolveVoyageBaseUrl("   ")).toBe(DEFAULT_VOYAGE_BASE_URL);
  });

  it("accepts https://api.voyageai.com/v1", () => {
    expect(resolveVoyageBaseUrl("https://api.voyageai.com/v1")).toBe(
      DEFAULT_VOYAGE_BASE_URL,
    );
  });

  it("rejects non-voyage hosts and non-https", () => {
    expect(() => resolveVoyageBaseUrl("https://evil.example/v1")).toThrow(ConfigError);
    expect(() => resolveVoyageBaseUrl("http://api.voyageai.com/v1")).toThrow(
      ConfigError,
    );
  });
});

describe("loadConfig voyage base", () => {
  it("rejects unsafe VOYAGE_BASE_URL overrides", () => {
    expect(() =>
      loadConfig(withTestConfigEnv({ VOYAGE_BASE_URL: "https://attacker.test/v1" })),
    ).toThrow(ConfigError);
  });
});
