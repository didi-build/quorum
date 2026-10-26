import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";
import {
  clearAuthDisplayCookieHeader,
  clearSessionCookieHeader,
  setAuthDisplayCookieHeader,
  setSessionCookieHeader,
} from "../src/domain/auth/cookies.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

function expectStandardAuthCookieAttributes(cookie: string): void {
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toMatch(/Max-Age=\d+/);
}

describe("auth cookie headers (unit)", () => {
  it("always sets Secure, HttpOnly, SameSite=Lax, Path, and Max-Age", () => {
    const config = loadConfig(withTestConfigEnv({ APP_ENV: "development" }));
    expectStandardAuthCookieAttributes(setSessionCookieHeader(config, "token"));
    expectStandardAuthCookieAttributes(
      setAuthDisplayCookieHeader(config, "signed", 300),
    );
    expectStandardAuthCookieAttributes(clearSessionCookieHeader(config));
    expectStandardAuthCookieAttributes(clearAuthDisplayCookieHeader(config));
  });
});
