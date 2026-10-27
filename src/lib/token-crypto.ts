import { bytesToBase64Url, base64UrlToBytes } from "./crypto.js";
import { deriveTokenAesKey } from "./hkdf-keys.js";

const AES_GCM_IV_BYTES = 12;

export class TokenDecryptError extends Error {
  constructor(message = "Failed to decrypt token") {
    super(message);
    this.name = "TokenDecryptError";
  }
}

export class TokenIvError extends Error {
  constructor(message = "Token IV must be random") {
    super(message);
    this.name = "TokenIvError";
  }
}

function assertIvNotAllZero(iv: Uint8Array): void {
  if (iv.length === 0) {
    throw new TokenIvError();
  }
  let allZero = true;
  for (const byte of iv) {
    if (byte !== 0) {
      allZero = false;
      break;
    }
  }
  if (allZero) {
    throw new TokenIvError();
  }
}

export async function encryptToken(
  tokenEncryptionKey: string,
  connectionId: string,
  plaintext: string,
): Promise<string> {
  const key = await deriveTokenAesKey(tokenEncryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  assertIvNotAllZero(iv);
  const additionalData = new TextEncoder().encode(connectionId);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
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
  connectionId: string,
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
  const key = await deriveTokenAesKey(tokenEncryptionKey);
  const additionalData = new TextEncoder().encode(connectionId);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new TokenDecryptError();
  }
}
