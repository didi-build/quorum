import type { QuorumConfig } from "../config/types.js";
import { resolveActor } from "../domain/auth/actor.js";
import { isGithubIdAllowed } from "../domain/auth/allowlist.js";
import {
  clearAuthDisplayCookieHeader,
  clearSessionCookieHeader,
  parseCookieHeader,
  setAuthDisplayCookieHeader,
  setSessionCookieHeader,
} from "../domain/auth/cookies.js";
import {
  createBrowserSession,
  getOrCreateUser,
  revokeBrowserSession,
} from "../domain/auth/browser-session.js";
import {
  createAuthDisplayValue,
  createLoginOauthState,
  verifyAuthDisplayValue,
  verifyLoginOauthState,
} from "../domain/auth/signing.js";
import {
  exchangeGithubUserCode,
  fetchGithubUser,
  githubUserAuthorizeUrl,
} from "../domain/oauth/github-user.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

const AUTH_DISPLAY_MAX_AGE_SECONDS = 300;

function redirectWithCookies(url: string, cookies: string[]): Response {
  const headers = new Headers();
  headers.set("Location", url);
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 307, headers });
}

export async function handleAuthRoute(
  request: Request,
  env: Env,
  config: QuorumConfig,
  pathname: string,
): Promise<Response | null> {
  const method = request.method;

  if (pathname === "/auth/github/login" && method === "GET") {
    if (!config.githubAppOauthClientId || !config.githubAppOauthClientSecret) {
      return jsonDetail("GitHub login is not configured", 503);
    }
    const state = await createLoginOauthState(config.sessionSecret);
    return redirectWithCookies(githubUserAuthorizeUrl(config, state), []);
  }

  if (pathname === "/auth/github/callback" && method === "GET") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return jsonDetail("Invalid or expired OAuth state", 400);
    }

    try {
      await verifyLoginOauthState(config.sessionSecret, state);
    } catch {
      return jsonDetail("Invalid or expired OAuth state", 400);
    }

    const appUrl = config.appBaseUrl.replace(/\/+$/, "");
    try {
      const accessToken = await exchangeGithubUserCode(config, code);
      const userPayload = await fetchGithubUser(accessToken);
      const githubId = userPayload.id;
      const login = userPayload.login;

      if (!isGithubIdAllowed(config, githubId)) {
        const signed = await createAuthDisplayValue(config.sessionSecret, login);
        return redirectWithCookies(`${appUrl}/app/not-allowed`, [
          setAuthDisplayCookieHeader(config, signed, AUTH_DISPLAY_MAX_AGE_SECONDS),
        ]);
      }

      const user = await getOrCreateUser(env.DB, githubId, login);
      const { rawToken } = await createBrowserSession(env.DB, config, user.id);
      return redirectWithCookies(`${appUrl}/app/`, [
        setSessionCookieHeader(config, rawToken),
        clearAuthDisplayCookieHeader(config),
      ]);
    } catch {
      return jsonDetail("Invalid or expired OAuth state", 400);
    }
  }

  if (pathname === "/auth/access-denied" && method === "GET") {
    const cookies = parseCookieHeader(request.headers.get("Cookie"));
    const signed = cookies.get(config.authDisplayCookieName);
    if (!signed) {
      return jsonDetail("No pending access request", 404);
    }
    try {
      const login = await verifyAuthDisplayValue(config.sessionSecret, signed);
      return Response.json({ login });
    } catch {
      return jsonDetail("No pending access request", 404);
    }
  }

  if (pathname === "/auth/me" && method === "GET") {
    const actor = await resolveActor(env.DB, config, request);
    if (actor === null) {
      return jsonDetail("Not authenticated", 401);
    }
    const user = await env.DB.prepare("SELECT login, github_id FROM users WHERE id = ?")
      .bind(actor.userId)
      .first<{ login: string; github_id: number }>();
    if (!user) {
      return jsonDetail("Not authenticated", 401);
    }
    return Response.json({ login: user.login, github_id: user.github_id });
  }

  if (pathname === "/auth/logout" && method === "POST") {
    const cookies = parseCookieHeader(request.headers.get("Cookie"));
    const rawToken = cookies.get(config.sessionCookieName);
    if (rawToken) {
      await revokeBrowserSession(env.DB, rawToken);
    }
    const headers = new Headers();
    headers.append("Set-Cookie", clearSessionCookieHeader(config));
    return new Response(null, { status: 204, headers });
  }

  return null;
}
