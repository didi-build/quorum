import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthLoginNoncesMatch } from "../src/domain/auth/oauth-login-nonce.js";
import * as crypto from "../src/lib/crypto.js";

describe("oauthLoginNoncesMatch (unit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes both nonces and compares with timingSafeEqualHex", async () => {
    const timingSpy = vi.spyOn(crypto, "timingSafeEqualHex");
    const shaSpy = vi.spyOn(crypto, "sha256Hex");

    const nonce = "same-nonce-value";
    await expect(oauthLoginNoncesMatch(nonce, nonce)).resolves.toBe(true);

    expect(shaSpy).toHaveBeenCalledTimes(2);
    expect(shaSpy).toHaveBeenCalledWith(nonce);
    expect(timingSpy).toHaveBeenCalledOnce();
    const [a, b] = timingSpy.mock.calls[0] ?? [];
    expect(a).toBe(await crypto.sha256Hex(nonce));
    expect(b).toBe(await crypto.sha256Hex(nonce));
  });

  it("rejects equal-length mismatches via timingSafeEqualHex", async () => {
    const timingSpy = vi.spyOn(crypto, "timingSafeEqualHex");
    await expect(
      oauthLoginNoncesMatch("aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"),
    ).resolves.toBe(false);
    expect(timingSpy).toHaveBeenCalledOnce();
  });

  it("rejects different-length mismatches via timingSafeEqualHex", async () => {
    const timingSpy = vi.spyOn(crypto, "timingSafeEqualHex");
    await expect(oauthLoginNoncesMatch("short", "much-longer-nonce")).resolves.toBe(
      false,
    );
    expect(timingSpy).toHaveBeenCalledOnce();
  });

  it("rejects empty cookie nonce", async () => {
    const timingSpy = vi.spyOn(crypto, "timingSafeEqualHex");
    await expect(oauthLoginNoncesMatch("", "state-nonce")).resolves.toBe(false);
    expect(timingSpy).toHaveBeenCalledOnce();
  });
});
