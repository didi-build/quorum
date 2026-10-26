import { describe, expect, it, vi } from "vitest";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../src/domain/oauth/state.js";

const TOKEN_KEY = "test-token-encryption-key";
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("provider OAuth state (unit)", () => {
  it("creates and verifies OAuth state", async () => {
    const state = await createOauthState(TOKEN_KEY, USER_ID);
    expect(await verifyOauthState(TOKEN_KEY, state)).toBe(USER_ID);
  });

  it("rejects tampered state", async () => {
    const state = await createOauthState(TOKEN_KEY, USER_ID);
    const tampered = `${state.slice(0, -4)}XXXX`;
    await expect(verifyOauthState(TOKEN_KEY, tampered)).rejects.toThrow(
      OAuthStateError,
    );
  });

  it("rejects forged state", async () => {
    await expect(
      verifyOauthState(TOKEN_KEY, "not-a-valid-state-token"),
    ).rejects.toThrow(OAuthStateError);
  });

  it("rejects expired state", async () => {
    const state = await createOauthState(TOKEN_KEY, USER_ID, 1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    await expect(verifyOauthState(TOKEN_KEY, state)).rejects.toThrow(OAuthStateError);
    vi.restoreAllMocks();
  });
});
