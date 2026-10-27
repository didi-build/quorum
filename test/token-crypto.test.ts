import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  TokenDecryptError,
} from "../src/lib/token-crypto.js";

const KEY = "test-token-encryption-key";

describe("token crypto (unit)", () => {
  it("round-trips token encryption", async () => {
    const ciphertext = await encryptToken(KEY, "linear-access-token-value");
    expect(ciphertext).not.toContain("linear-access");
    const plain = await decryptToken(KEY, ciphertext);
    expect(plain).toBe("linear-access-token-value");
  });

  it("rejects tampered ciphertext", async () => {
    const ciphertext = await encryptToken(KEY, "secret");
    const tampered = `${ciphertext.slice(0, -4)}XXXX`;
    await expect(decryptToken(KEY, tampered)).rejects.toThrow(TokenDecryptError);
  });
});
