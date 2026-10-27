import { describe, expect, it, vi } from "vitest";
import {
  isLinearTokenExpired,
  tokenExpiresAtFromResponse,
} from "../src/domain/oauth/linear.js";

describe("Linear token expiry helpers (unit)", () => {
  it("returns null when expires_in is absent", () => {
    expect(tokenExpiresAtFromResponse({ access_token: "x" })).toBeNull();
  });

  it("computes expiry from expires_in seconds", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const expiresAt = tokenExpiresAtFromResponse({
      access_token: "x",
      expires_in: 3600,
    });
    expect(expiresAt).toBe(new Date(now + 3600 * 1000).toISOString());
    vi.restoreAllMocks();
  });

  it("treats past expiry as expired for proactive refresh", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isLinearTokenExpired(past)).toBe(true);
    expect(isLinearTokenExpired(null)).toBe(false);
  });
});
