import { describe, expect, it } from "vitest";
import {
  ConfigError,
  loadConfig,
  parseAllowedGithubIds,
  parseWsAllowedOriginSet,
  requireEnvString,
} from "../src/config/index.js";
import { testConfigEnv, withTestConfigEnv } from "./fixtures/config-env.js";

describe("parseAllowedGithubIds (v1 parity)", () => {
  it("returns empty set for blank input", () => {
    expect(parseAllowedGithubIds("")).toEqual(new Set());
    expect(parseAllowedGithubIds("   ")).toEqual(new Set());
  });

  it("parses comma-separated ids with surrounding whitespace", () => {
    expect(parseAllowedGithubIds(" 42 , 100 , ")).toEqual(new Set([42, 100]));
  });

  it("skips empty segments between commas", () => {
    expect(parseAllowedGithubIds("1,,2")).toEqual(new Set([1, 2]));
  });

  it("throws ConfigError for invalid id segments", () => {
    expect(() => parseAllowedGithubIds("12abc")).toThrow(ConfigError);
    expect(() => parseAllowedGithubIds("12abc")).toThrow(
      /Invalid environment variable: AUTH_ALLOWED_GITHUB_IDS/,
    );
  });
});

describe("parseWsAllowedOriginSet (v1 parity)", () => {
  it("defaults to app base URL origin when WS list is empty", () => {
    expect(parseWsAllowedOriginSet("", "http://localhost:8787/")).toEqual(
      new Set(["http://localhost:8787"]),
    );
    expect(parseWsAllowedOriginSet("  ", "http://localhost:8787/app/")).toEqual(
      new Set(["http://localhost:8787"]),
    );
    expect(parseWsAllowedOriginSet("  ", "http://localhost:8000")).toEqual(
      new Set(["http://localhost:8000"]),
    );
  });

  it("strips trailing slashes from explicit origins", () => {
    expect(
      parseWsAllowedOriginSet(
        "http://localhost:5173/,http://localhost:8787/",
        "http://ignored",
      ),
    ).toEqual(new Set(["http://localhost:5173", "http://localhost:8787"]));
  });
});

describe("requireEnvString", () => {
  it("throws ConfigError naming the variable when missing or empty", () => {
    expect(() => requireEnvString({}, "TOKEN_ENCRYPTION_KEY")).toThrow(ConfigError);
    expect(() => requireEnvString({}, "TOKEN_ENCRYPTION_KEY")).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    );
    expect(() =>
      requireEnvString({ TOKEN_ENCRYPTION_KEY: "   " }, "TOKEN_ENCRYPTION_KEY"),
    ).toThrow(ConfigError);
  });

  it("trims surrounding whitespace from values", () => {
    expect(requireEnvString({ SESSION_SECRET: "  abc  " }, "SESSION_SECRET")).toBe(
      "abc",
    );
  });
});

describe("loadConfig defaults (v1 / .dev.vars.example)", () => {
  it("throws ConfigError when a required secret is missing", () => {
    expect(() => loadConfig({ ...testConfigEnv, ANTHROPIC_API_KEY: "" })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ ...testConfigEnv, ANTHROPIC_API_KEY: "" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("rejects invalid APP_BASE_URL when deriving ws origins", () => {
    expect(() =>
      loadConfig(withTestConfigEnv({ APP_BASE_URL: "not-a-valid-url" })),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig(withTestConfigEnv({ APP_BASE_URL: "not-a-valid-url" })),
    ).toThrow(/Invalid environment variable: APP_BASE_URL/);
  });

  it("rejects SESSION_TTL_DAYS outside the allowed range", () => {
    expect(() => loadConfig(withTestConfigEnv({ SESSION_TTL_DAYS: "0" }))).toThrow(
      /SESSION_TTL_DAYS/,
    );
    expect(() => loadConfig(withTestConfigEnv({ SESSION_TTL_DAYS: "99999" }))).toThrow(
      /SESSION_TTL_DAYS/,
    );
  });

  it("treats unset APP_ENV as production", () => {
    const env = withTestConfigEnv();
    delete (env as Record<string, unknown>).APP_ENV;
    expect(loadConfig(env).appEnv).toBe("production");
  });

  it("rejects invalid numeric settings", () => {
    expect(() => loadConfig(withTestConfigEnv({ RRF_K: "12abc" }))).toThrow(
      /Invalid environment variable: RRF_K/,
    );
    expect(() => loadConfig(withTestConfigEnv({ RRF_K: "1.5" }))).toThrow(
      /Invalid environment variable: RRF_K/,
    );
    expect(() =>
      loadConfig(withTestConfigEnv({ COVERAGE_MIN_SCORE: "0.3oops" })),
    ).toThrow(/Invalid environment variable: COVERAGE_MIN_SCORE/);
  });

  it("applies Quorum local defaults and derived sets", () => {
    const config = loadConfig(testConfigEnv);
    expect(config.appEnv).toBe("development");
    expect(config.appBaseUrl).toBe("http://localhost:8787");
    expect(config.defaultUserId).toBe("00000000-0000-4000-8000-000000000001");
    expect(config.sessionCookieName).toBe("quorum_session");
    expect(config.sessionTtlDays).toBe(30);
    expect(config.voyageModel).toBe("voyage-context-4");
    expect(config.embeddingDimensions).toBe(1024);
    expect(config.rrfK).toBe(60);
    expect(config.retrievalTopK).toBe(10);
    expect(config.coverageMinScore).toBe(0.3);
    expect(config.chunkTargetTokens).toBe(512);
    expect(config.chunkOverlapTokens).toBe(50);
    expect(config.supervisorModel).toBe("claude-haiku-4-5");
    expect(config.personaModel).toBe("claude-sonnet-5");
    expect(config.councilChairModel).toBe("claude-sonnet-5");
    expect(config.retrievalAnswerModel).toBe("claude-sonnet-5");
    expect(config.allowedGithubIds).toEqual(new Set());
    expect(config.wsAllowedOriginSet).toEqual(new Set(["http://localhost:8787"]));
  });

  it("honors numeric overrides such as RRF_K", () => {
    const config = loadConfig(withTestConfigEnv({ RRF_K: "30" }));
    expect(config.rrfK).toBe(30);
  });

  it("wires allowlist and ws origins from env strings", () => {
    const config = loadConfig(
      withTestConfigEnv({
        AUTH_ALLOWED_GITHUB_IDS: "7, 9",
        WS_ALLOWED_ORIGINS: "https://quorum.example/",
        APP_BASE_URL: "http://localhost:8787",
      }),
    );
    expect(config.allowedGithubIds).toEqual(new Set([7, 9]));
    expect(config.wsAllowedOriginSet).toEqual(new Set(["https://quorum.example"]));
  });
});
