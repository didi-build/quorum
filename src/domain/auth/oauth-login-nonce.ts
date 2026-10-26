import { sha256Hex, timingSafeEqualHex } from "../../lib/crypto.js";

export async function oauthLoginNoncesMatch(
  cookieNonce: string,
  stateNonce: string,
): Promise<boolean> {
  const [cookieHash, stateHash] = await Promise.all([
    sha256Hex(cookieNonce),
    sha256Hex(stateNonce),
  ]);
  return timingSafeEqualHex(cookieHash, stateHash);
}
