import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../src/domain/oauth/state.js";

const TOKEN_KEY = "test-token-encryption-key";
const USER_ID = "00000000-0000-4000-8000-000000000001";

const START_MS = 1_700_000_000_000;
const TTL_SECONDS = 60;

function msAtExpirySecond(startMs: number, ttlSeconds: number): number {
  const expiresAt = Math.floor(startMs / 1000) + ttlSeconds;
  return expiresAt * 1000;
}

function msOneSecondBeforeExpiry(startMs: number, ttlSeconds: number): number {
  return msAtExpirySecond(startMs, ttlSeconds) - 1000;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth state expiry boundary (unit)", () => {
  it("rejects verification at exactly expiresAt when the state was never used", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START_MS);
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, TTL_SECONDS);

    vi.spyOn(Date, "now").mockReturnValue(msAtExpirySecond(START_MS, TTL_SECONDS));
    await expect(verifyOauthState(TOKEN_KEY, state)).rejects.toThrow(OAuthStateError);
  });

  it("rejects verification at exactly expiresAt when the state was used before", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START_MS);
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, TTL_SECONDS);

    await verifyOauthState(TOKEN_KEY, state, { singleUse: true });

    vi.spyOn(Date, "now").mockReturnValue(msAtExpirySecond(START_MS, TTL_SECONDS));
    await expect(
      verifyOauthState(TOKEN_KEY, state, { singleUse: true }),
    ).rejects.toThrow(OAuthStateError);
  });

  it("rejects a used state at expiresAt minus one second (replay)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START_MS);
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, TTL_SECONDS);

    await verifyOauthState(TOKEN_KEY, state, { singleUse: true });

    vi.spyOn(Date, "now").mockReturnValue(
      msOneSecondBeforeExpiry(START_MS, TTL_SECONDS),
    );
    await expect(
      verifyOauthState(TOKEN_KEY, state, { singleUse: true }),
    ).rejects.toThrow(OAuthStateError);
  });

  it("rejects a used state at exactly expiresAt (expiry, not replay after purge)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START_MS);
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, TTL_SECONDS);

    await verifyOauthState(TOKEN_KEY, state, { singleUse: true });

    vi.spyOn(Date, "now").mockReturnValue(msAtExpirySecond(START_MS, TTL_SECONDS));
    await expect(verifyOauthState(TOKEN_KEY, state)).rejects.toThrow(OAuthStateError);
  });
});
