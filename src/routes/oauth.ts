import type { QuorumConfig } from "../config/types.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import {
  createOauthState,
  OAuthStateError,
  verifyOauthState,
} from "../domain/oauth/state.js";
import {
  linearAuthorizeUrl,
  linearExchangeCode,
  linearFetchUser,
  LinearTokenExchangeError,
  upsertLinearConnection,
} from "../domain/oauth/linear.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

function redirectResponse(url: string): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: url },
  });
}

export async function handleOauthRoute(
  request: Request,
  env: Env,
  config: QuorumConfig,
  pathname: string,
  actor: ActorContext | null,
): Promise<Response | null> {
  const method = request.method;

  if (pathname === "/oauth/linear/authorize" && method === "GET") {
    if (!config.linearClientId) {
      return jsonDetail("Linear OAuth is not configured", 503);
    }
    if (actor === null) {
      return jsonDetail("Not authenticated", 401);
    }
    const state = await createOauthState(config.tokenEncryptionKey, actor.userId);
    return redirectResponse(linearAuthorizeUrl(config, state));
  }

  if (pathname === "/oauth/linear/callback" && method === "GET") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return jsonDetail("Invalid or expired OAuth state", 400);
    }

    let userId: string;
    try {
      userId = await verifyOauthState(config.tokenEncryptionKey, state);
    } catch (error) {
      if (error instanceof OAuthStateError) {
        return jsonDetail("Invalid or expired OAuth state", 400);
      }
      throw error;
    }

    const appUrl = config.appBaseUrl.replace(/\/+$/, "");
    try {
      const token = await linearExchangeCode(config, code);
      const userInfo = await linearFetchUser(token.access_token);
      await upsertLinearConnection(env.DB, config, userId, token, userInfo);
      return redirectResponse(
        `${appUrl}/app/connections?provider=linear&status=connected`,
      );
    } catch (error) {
      console.error(JSON.stringify({ event: "linear_oauth_callback_failed" }));
      if (error instanceof LinearTokenExchangeError) {
        return jsonDetail("Linear OAuth failed", 502);
      }
      return jsonDetail("Linear OAuth failed", 500);
    }
  }

  return null;
}
