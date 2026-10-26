import { describe, expect, it } from "vitest";
import {
  createAuthDisplayValue,
  createLoginOauthState,
  SignedValueError,
  verifyAuthDisplayValue,
  verifyLoginOauthState,
} from "../src/domain/auth/signing.js";

const SESSION_SECRET = "test-session-secret";

describe("auth signing (unit)", () => {
  it("round-trips login OAuth state", async () => {
    const { state, nonce } = await createLoginOauthState(SESSION_SECRET);
    expect(await verifyLoginOauthState(SESSION_SECRET, state)).toBe(nonce);
  });

  it("round-trips auth display value", async () => {
    const signed = await createAuthDisplayValue(SESSION_SECRET, "octocat");
    expect(await verifyAuthDisplayValue(SESSION_SECRET, signed)).toBe("octocat");
  });

  it("rejects tampered signed values", async () => {
    const signed = await createAuthDisplayValue(SESSION_SECRET, "octocat");
    expect(await verifyAuthDisplayValue(SESSION_SECRET, signed)).toBe("octocat");
    await expect(
      verifyAuthDisplayValue(SESSION_SECRET, "not-a-valid-token"),
    ).rejects.toThrow(SignedValueError);
  });
});
