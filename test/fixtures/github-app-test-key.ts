/** Runtime-generated PKCS#8 RSA key for GitHub App unit tests (never a committed secret). */
export async function generateTestPrivateKeyBase64(): Promise<string> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  )) as ArrayBuffer;
  const bytes = new Uint8Array(pkcs8);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
