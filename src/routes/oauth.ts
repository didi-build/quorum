import type { QuorumConfig } from "../config/types.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";
import {
  fetchInstallation,
  GITHUB_APP_INSTALLATION_ID_INVALID_DETAIL,
  GITHUB_APP_INSTALLATION_ID_PATTERN,
  githubInstallUrl,
  isGithubAppConfigured,
  upsertGithubConnection,
} from "../domain/oauth/github-app.js";
import {
  OAuthStateError,
  createOauthState,
  verifyOauthState,
} from "../domain/oauth/state.js";

function redirect(location: string): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: location },
  });
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
    const state = await createOauthState(config.tokenEncryptionKey, actor.userId);
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
      userId = await verifyOauthState(config.tokenEncryptionKey, state);
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

  return null;
}
