import type { QuorumConfig } from "../config/types.js";
import {
  clearOAuthConnectionNonceCookieHeader,
  OAUTH_CONNECTION_NONCE_COOKIE_NAME,
  parseCookieHeader,
  setOAuthConnectionNonceCookieHeader,
} from "../domain/auth/cookies.js";
import { oauthLoginNoncesMatch } from "../domain/auth/oauth-login-nonce.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import {
  fetchInstallation,
  GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL,
  GITHUB_APP_INSTALLATION_ID_PATTERN,
  githubInstallUrl,
  isGithubAppConfigured,
  upsertGithubConnection,
} from "../domain/oauth/github-app.js";
import {
  linearAuthorizeUrl,
  linearExchangeCode,
  linearFetchUser,
  LinearTokenExchangeError,
  upsertLinearConnection,
} from "../domain/oauth/linear.js";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../domain/oauth/state.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 307, headers });
}

function oauthStateJsonResponse(detail: string, status: number): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", clearOAuthConnectionNonceCookieHeader());
  return Response.json({ detail }, { status, headers });
}

export async function handleOAuthRoute(
  request: Request,
  env: Env,
  config: QuorumConfig,
  pathname: string,
  actor: ActorContext | null,
): Promise<Response | null> {
  const method = request.method;

  if (pathname === "/oauth/github/authorize" && method === "GET") {
    if (actor === null) {
      return jsonDetail("Not authenticated", 401);
    }
    if (!isGithubAppConfigured(config)) {
      return jsonDetail("GitHub App is not configured", 503);
    }
    const { state } = await createOauthState(config.tokenEncryptionKey, actor.userId);
    return redirect(githubInstallUrl(config, state));
  }

  if (pathname === "/oauth/github/callback" && method === "GET") {
    const url = new URL(request.url);
    const installationId = url.searchParams.get("installation_id");
    const state = url.searchParams.get("state");
    if (
      installationId === null ||
      !GITHUB_APP_INSTALLATION_ID_PATTERN.test(installationId)
    ) {
      return jsonDetail(GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL, 400);
    }
    if (!state) {
      return jsonDetail("Invalid or expired OAuth state", 400);
    }

    let userId: string;
    try {
      userId = (await verifyOauthState(config.tokenEncryptionKey, state)).userId;
    } catch (error) {
      if (error instanceof OAuthStateError) {
        return jsonDetail("Invalid or expired OAuth state", 400);
      }
      throw error;
    }

    const installation = await fetchInstallation(config, installationId);
    await upsertGithubConnection(env.DB, userId, installationId, installation);

    const redirectUrl = `${config.appBaseUrl}/app/connections?provider=github&status=connected`;
    return redirect(redirectUrl);
  }

  if (pathname === "/oauth/linear/authorize" && method === "GET") {
    if (!config.linearClientId) {
      return jsonDetail("Linear OAuth is not configured", 503);
    }
    if (actor === null) {
      return jsonDetail("Not authenticated", 401);
    }
    const { state, nonce } = await createOauthState(
      config.tokenEncryptionKey,
      actor.userId,
    );
    return redirect(linearAuthorizeUrl(config, state), [
      setOAuthConnectionNonceCookieHeader(nonce),
    ]);
  }

  if (pathname === "/oauth/linear/callback" && method === "GET") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return oauthStateJsonResponse("Invalid or expired OAuth state", 400);
    }

    const callbackCookies = parseCookieHeader(request.headers.get("Cookie"));
    const nonceCookie = callbackCookies.get(OAUTH_CONNECTION_NONCE_COOKIE_NAME);

    let userId: string;
    let stateNonce: string;
    try {
      const verified = await verifyOauthState(config.tokenEncryptionKey, state, {
        singleUse: true,
      });
      userId = verified.userId;
      stateNonce = verified.stateNonce;
    } catch (error) {
      if (error instanceof OAuthStateError) {
        return oauthStateJsonResponse("Invalid or expired OAuth state", 400);
      }
      throw error;
    }

    if (!nonceCookie || !(await oauthLoginNoncesMatch(nonceCookie, stateNonce))) {
      return oauthStateJsonResponse("Invalid or expired OAuth state", 400);
    }

    const appUrl = config.appBaseUrl.replace(/\/+$/, "");
    const clearConnectionNonce = clearOAuthConnectionNonceCookieHeader();
    try {
      const token = await linearExchangeCode(config, code);
      const userInfo = await linearFetchUser(token.access_token);
      await upsertLinearConnection(env.DB, config, userId, token, userInfo);
      return redirect(`${appUrl}/app/connections?provider=linear&status=connected`, [
        clearConnectionNonce,
      ]);
    } catch (error) {
      console.error(JSON.stringify({ event: "linear_oauth_callback_failed" }));
      if (error instanceof LinearTokenExchangeError) {
        return oauthStateJsonResponse("Linear OAuth failed", 502);
      }
      return oauthStateJsonResponse("Linear OAuth failed", 500);
    }
  }

  return null;
}
