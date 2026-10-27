import { describe, expect, it, vi } from "vitest";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../src/domain/oauth/state.js";
import { deriveOauthStateHmacKey } from "../src/lib/hkdf-keys.js";

const TOKEN_KEY = "test-token-encryption-key";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONSUMED_OAUTH_STATES_MAX = 4096;

async function loadOauthStateModule() {
  vi.resetModules();
  return import("../src/domain/oauth/state.js");
}

async function consumeSingleUseStates(
  createOauthStateFn: typeof createOauthState,
  verifyOauthStateFn: typeof verifyOauthState,
  specs: { ttlSeconds: number }[],
): Promise<string[]> {
  const created = await Promise.all(
    specs.map((spec) => createOauthStateFn(TOKEN_KEY, USER_ID, spec.ttlSeconds)),
  );
  const states: string[] = [];
  for (const { state } of created) {
    await verifyOauthStateFn(TOKEN_KEY, state, { singleUse: true });
    states.push(state);
  }
  return states;
}

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

  it("drops consumed-state entries after their expiry and still rejects expired signatures", async () => {
    const ttlSeconds = 60;
    const startMs = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startMs);
    const { state } = await createOauthState(TOKEN_KEY, USER_ID, ttlSeconds);

    await verifyOauthState(TOKEN_KEY, state, { singleUse: true });
    await expect(
      verifyOauthState(TOKEN_KEY, state, { singleUse: true }),
    ).rejects.toThrow(OAuthStateError);

    vi.spyOn(Date, "now").mockReturnValue(startMs + (ttlSeconds + 1) * 1000);
    await expect(verifyOauthState(TOKEN_KEY, state)).rejects.toThrow(OAuthStateError);
    await expect(
      verifyOauthState(TOKEN_KEY, state, { singleUse: true }),
    ).rejects.toThrow(OAuthStateError);

    vi.restoreAllMocks();
  });

  it("purgeConsumedOauthStates drops expired consumed entries from the tracking list", async () => {
    const {
      createOauthState: createState,
      verifyOauthState: verifyState,
      OAuthStateError: StateError,
    } = await loadOauthStateModule();
    const shortTtlSeconds = 30;
    const keeperTtlSeconds = 36_000;
    const refillTtlSeconds = 3600;
    const startMs = 1_700_000_100_000;
    vi.spyOn(Date, "now").mockReturnValue(startMs);

    const [keeperState] = await consumeSingleUseStates(createState, verifyState, [
      { ttlSeconds: keeperTtlSeconds },
    ]);
    await consumeSingleUseStates(
      createState,
      verifyState,
      Array.from({ length: CONSUMED_OAUTH_STATES_MAX - 1 }, () => ({
        ttlSeconds: shortTtlSeconds,
      })),
    );

    const afterExpiryMs = startMs + (shortTtlSeconds + 5) * 1000;
    vi.spyOn(Date, "now").mockReturnValue(afterExpiryMs);

    const { state: purgeProbe } = await createState(
      TOKEN_KEY,
      USER_ID,
      refillTtlSeconds,
    );
    let purgeDeletes = 0;
    const mapDelete = Map.prototype.delete;
    const deleteSpy = vi.spyOn(Map.prototype, "delete").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
    ) {
      purgeDeletes += 1;
      return mapDelete.call(this, key);
    });
    await verifyState(TOKEN_KEY, purgeProbe, { singleUse: false });
    deleteSpy.mockRestore();
    expect(purgeDeletes).toBe(CONSUMED_OAUTH_STATES_MAX - 1);

    await expect(
      verifyState(TOKEN_KEY, keeperState, { singleUse: true }),
    ).rejects.toThrow(StateError);

    const refillStates = await consumeSingleUseStates(
      createState,
      verifyState,
      Array.from({ length: CONSUMED_OAUTH_STATES_MAX - 1 }, (_, index) => ({
        ttlSeconds: refillTtlSeconds + index,
      })),
    );

    const { state: overflow } = await createState(
      TOKEN_KEY,
      USER_ID,
      refillTtlSeconds + CONSUMED_OAUTH_STATES_MAX,
    );
    await verifyState(TOKEN_KEY, overflow, { singleUse: true });

    await expect(
      verifyState(TOKEN_KEY, refillStates[1], { singleUse: true }),
    ).rejects.toThrow(StateError);
    await expect(
      verifyState(TOKEN_KEY, refillStates[0], { singleUse: true }),
    ).resolves.toEqual({
      userId: USER_ID,
      stateNonce: expect.any(String),
    });
    await expect(
      verifyState(TOKEN_KEY, keeperState, { singleUse: true }),
    ).rejects.toThrow(StateError);

    vi.restoreAllMocks();
  }, 120_000);

  it("evicts the soonest-expiring consumed OAuth state at CONSUMED_OAUTH_STATES_MAX", async () => {
    const {
      createOauthState: createState,
      verifyOauthState: verifyState,
      OAuthStateError: StateError,
    } = await loadOauthStateModule();
    const startMs = 1_700_000_200_000;
    vi.spyOn(Date, "now").mockReturnValue(startMs);

    const longStates = await consumeSingleUseStates(
      createState,
      verifyState,
      Array.from({ length: CONSUMED_OAUTH_STATES_MAX - 1 }, () => ({
        ttlSeconds: 7200,
      })),
    );

    const soonestStates = await consumeSingleUseStates(createState, verifyState, [
      { ttlSeconds: 60 },
    ]);
    const soonest = soonestStates[0];

    const newestStates = await consumeSingleUseStates(createState, verifyState, [
      { ttlSeconds: 7200 },
    ]);
    const newest = newestStates[0];

    await expect(
      verifyState(TOKEN_KEY, longStates[0], { singleUse: true }),
    ).rejects.toThrow(StateError);
    await expect(
      verifyState(TOKEN_KEY, longStates[1], { singleUse: true }),
    ).rejects.toThrow(StateError);
    await expect(verifyState(TOKEN_KEY, newest, { singleUse: true })).rejects.toThrow(
      StateError,
    );
    await expect(verifyState(TOKEN_KEY, soonest, { singleUse: true })).resolves.toEqual(
      {
        userId: USER_ID,
        stateNonce: expect.any(String),
      },
    );

    vi.restoreAllMocks();
  }, 120_000);
});
