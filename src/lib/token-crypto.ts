import { bytesToBase64Url, base64UrlToBytes } from "./crypto.js";

const AES_GCM_IV_BYTES = 12;

async function encryptionKeyBytes(tokenEncryptionKey: string): Promise<CryptoKey> {
  if (!tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  const raw = new TextEncoder().encode(tokenEncryptionKey);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export class TokenDecryptError extends Error {
  constructor(message = "Failed to decrypt token") {
    super(message);
    this.name = "TokenDecryptError";
  }
}

export async function encryptToken(
  tokenEncryptionKey: string,
  plaintext: string,
): Promise<string> {
  const key = await encryptionKeyBytes(tokenEncryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64Url(combined);
}

export async function decryptToken(
  tokenEncryptionKey: string,
  stored: string,
): Promise<string> {
  let combined: Uint8Array;
  try {
    combined = base64UrlToBytes(stored);
  } catch {
    throw new TokenDecryptError();
  }
  if (combined.length <= AES_GCM_IV_BYTES) {
    throw new TokenDecryptError();
  }
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  const key = await encryptionKeyBytes(tokenEncryptionKey);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    throw new TokenDecryptError();
  }
}
