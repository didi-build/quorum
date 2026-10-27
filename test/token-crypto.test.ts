import { describe, expect, it, vi } from "vitest";
import {
  decryptToken,
  encryptToken,
  TokenDecryptError,
  TokenIvError,
} from "../src/lib/token-crypto.js";

const KEY = "test-token-encryption-key";
const CONNECTION_A = "00000000-0000-4000-8000-000000000010";
const CONNECTION_B = "00000000-0000-4000-8000-000000000020";

describe("token crypto (unit)", () => {
  it("round-trips token encryption with connection AAD", async () => {
    const ciphertext = await encryptToken(
      KEY,
      CONNECTION_A,
      "linear-access-token-value",
    );
    expect(ciphertext).not.toContain("linear-access");
    const plain = await decryptToken(KEY, CONNECTION_A, ciphertext);
    expect(plain).toBe("linear-access-token-value");
  });

  it("rejects ciphertext moved to another connection row", async () => {
    const ciphertext = await encryptToken(KEY, CONNECTION_A, "secret");
    await expect(decryptToken(KEY, CONNECTION_B, ciphertext)).rejects.toThrow(
      TokenDecryptError,
    );
  });

  it("rejects tampered ciphertext", async () => {
    const ciphertext = await encryptToken(KEY, CONNECTION_A, "secret");
    const tampered = `${ciphertext.slice(0, -4)}XXXX`;
    await expect(decryptToken(KEY, CONNECTION_A, tampered)).rejects.toThrow(
      TokenDecryptError,
    );
  });

  it("rejects an all-zero IV", async () => {
    const randomSpy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation((array) => {
        if (array instanceof Uint8Array) {
          array.fill(0);
        }
        return array;
      });
    await expect(encryptToken(KEY, CONNECTION_A, "secret")).rejects.toThrow(
      TokenIvError,
    );
    randomSpy.mockRestore();
  });
});
