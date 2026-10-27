import { describe, expect, it } from "vitest";
import {
  deriveOauthStateHmacKey,
  deriveTokenAesKeyBits,
} from "../src/lib/hkdf-keys.js";
import { base64UrlToBytes } from "../src/lib/crypto.js";
import { encryptToken } from "../src/lib/token-crypto.js";

const TOKEN_KEY = "test-token-encryption-key";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000010";
const PLAINTEXT = "linear-access-token-value";

async function importAesGcmKeyFromRawBits(bits: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM", length: 256 }, false, [
    "decrypt",
  ]);
}

async function decryptWithRawAesKey(
  key: CryptoKey,
  connectionId: string,
  stored: string,
): Promise<string> {
  const combined = base64UrlToBytes(stored);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const additionalData = new TextEncoder().encode(connectionId);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}

describe("token crypto production HKDF key path (unit)", () => {
  it("decrypts production encrypt ciphertext only with deriveTokenAesKeyBits, not OAuth state HMAC bits", async () => {
    const ciphertext = await encryptToken(TOKEN_KEY, CONNECTION_ID, PLAINTEXT);

    const wrongKey = await importAesGcmKeyFromRawBits(
      await deriveOauthStateHmacKey(TOKEN_KEY),
    );
    await expect(
      decryptWithRawAesKey(wrongKey, CONNECTION_ID, ciphertext),
    ).rejects.toThrow();

    const correctKey = await importAesGcmKeyFromRawBits(
      await deriveTokenAesKeyBits(TOKEN_KEY),
    );
    const plain = await decryptWithRawAesKey(correctKey, CONNECTION_ID, ciphertext);
    expect(plain).toBe(PLAINTEXT);
  });
});
