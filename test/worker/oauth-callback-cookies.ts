import { OAUTH_LOGIN_NONCE_COOKIE_NAME } from "../../src/domain/auth/cookies.js";

export function oauthLoginNonceCookieHeader(nonce: string): string {
  return `${OAUTH_LOGIN_NONCE_COOKIE_NAME}=${nonce}`;
}
