import { describe, expect, it } from "vitest";
import {
  deriveOauthStateHmacKey,
  deriveTokenAesKeyBits,
} from "../src/lib/hkdf-keys.js";

const TOKEN_KEY = "test-token-encryption-key";

describe("HKDF key separation (unit)", () => {
  it("derives different material for token AES and OAuth state HMAC labels", async () => {
    const hmacKey = await deriveOauthStateHmacKey(TOKEN_KEY);
    const aesKeyBits = await deriveTokenAesKeyBits(TOKEN_KEY);
    expect(hmacKey.byteLength).toBe(32);
    expect(aesKeyBits.byteLength).toBe(32);
    expect([...hmacKey]).not.toEqual([...aesKeyBits]);
  });
});
