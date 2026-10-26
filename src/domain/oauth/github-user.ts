import type { QuorumConfig } from "../../config/types.js";

export class GithubTokenExchangeError extends Error {
  constructor(message = "GitHub token exchange failed") {
    super(message);
    this.name = "GithubTokenExchangeError";
  }
}

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

/** Required by GitHub API; requests without User-Agent may receive 403. */
export const GITHUB_HTTP_USER_AGENT = "Quorum/1.0 (didi-build/quorum)";

export function githubUserAuthorizeUrl(config: QuorumConfig, state: string): string {
  if (!config.githubAppOauthClientId) {
    throw new Error("GITHUB_APP_OAUTH_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: config.githubAppOauthClientId,
    redirect_uri: config.githubAuthRedirectUri,
    scope: "read:user",
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeGithubUserCode(
  config: QuorumConfig,
  code: string,
): Promise<string> {
  if (!config.githubAppOauthClientSecret) {
    throw new Error("GITHUB_APP_OAUTH_CLIENT_SECRET is not configured");
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": GITHUB_HTTP_USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: config.githubAppOauthClientId,
      client_secret: config.githubAppOauthClientSecret,
      code,
      redirect_uri: config.githubAuthRedirectUri,
    }),
  });

  if (!response.ok) {
    throw new GithubTokenExchangeError();
  }

  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (typeof payload.error === "string" && payload.error.length > 0) {
    throw new GithubTokenExchangeError();
  }
  const accessToken = payload.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("GitHub token exchange did not return an access token");
  }
  return accessToken;
}

export async function fetchGithubUser(accessToken: string): Promise<{
  id: number;
  login: string;
}> {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": GITHUB_HTTP_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error("GitHub user fetch failed");
  }

  const payload = (await response.json()) as { id?: number; login?: string };
  if (typeof payload.id !== "number" || typeof payload.login !== "string") {
    throw new Error("GitHub user payload was invalid");
  }
  return { id: payload.id, login: payload.login };
}
