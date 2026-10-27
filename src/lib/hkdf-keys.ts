const textEncoder = new TextEncoder();
const HKDF_SALT = new Uint8Array(0);

const TOKEN_AES_INFO = textEncoder.encode("quorum-token-aes-v1");
const OAUTH_STATE_HMAC_INFO = textEncoder.encode("quorum-oauth-state-hmac-v1");

async function importHkdfBaseKey(tokenEncryptionKey: string): Promise<CryptoKey> {
  if (!tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(tokenEncryptionKey),
    "HKDF",
    false,
    ["deriveKey", "deriveBits"],
  );
}

async function deriveHkdfBits(
  tokenEncryptionKey: string,
  info: Uint8Array,
  lengthBits: number,
): Promise<Uint8Array> {
  const baseKey = await importHkdfBaseKey(tokenEncryptionKey);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info,
    },
    baseKey,
    lengthBits,
  );
  return new Uint8Array(bits);
}

export async function deriveTokenAesKeyBits(
  tokenEncryptionKey: string,
): Promise<Uint8Array> {
  return deriveHkdfBits(tokenEncryptionKey, TOKEN_AES_INFO, 256);
}

export async function deriveTokenAesKey(
  tokenEncryptionKey: string,
): Promise<CryptoKey> {
  const baseKey = await importHkdfBaseKey(tokenEncryptionKey);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: TOKEN_AES_INFO,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveOauthStateHmacKey(
  tokenEncryptionKey: string,
): Promise<Uint8Array> {
  return deriveHkdfBits(tokenEncryptionKey, OAUTH_STATE_HMAC_INFO, 256);
}
