import { describe, expect, it, vi } from "vitest";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../src/domain/oauth/state.js";
import { deriveOauthStateHmacKey } from "../src/lib/hkdf-keys.js";

const TOKEN_KEY = "test-token-encryption-key";
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("provider OAuth state (unit)", () => {
  it("creates and verifies OAuth state", async () => {
    const { state } = await createOauthState(TOKEN_KEY, USER_ID);
    const verified = await verifyOauthState(TOKEN_KEY, state);
    expect(verified.userId).toBe(USER_ID);
    expect(verified.stateNonce).toBeTruthy();
  });

  it("derives state HMAC key via HKDF, not raw SHA-256 of TOKEN_ENCRYPTION_KEY", async () => {
    const hmacKey = await deriveOauthStateHmacKey(TOKEN_KEY);
    const rawDigest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_KEY)),
    );
    expect(hmacKey.byteLength).toBe(32);
    expect(hmacKey.every((byte, index) => byte === rawDigest[index])).toBe(false);
  });

  it("rejects tampered state", async () => {
    const { state } = await createOauthState(TOKEN_KEY, USER_ID);
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

  it("rejects replayed state when singleUse is set", async () => {
    const { state } = await createOauthState(TOKEN_KEY, USER_ID);
    await verifyOauthState(TOKEN_KEY, state, { singleUse: true });
    await expect(
      verifyOauthState(TOKEN_KEY, state, { singleUse: true }),
    ).rejects.toThrow(OAuthStateError);
  });

  it("rejects expired state", async () => {
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, 1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    await expect(verifyOauthState(TOKEN_KEY, state)).rejects.toThrow(OAuthStateError);
    vi.restoreAllMocks();
  });
});
