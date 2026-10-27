import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import type { ActorContext } from "../schemas/actor.js";
import type { AvailableSourceItem, SourceType } from "../schemas/available-sources.js";
import { can_access } from "../permissions.js";
import {
  GITHUB_API_BASE,
  getInstallationAccessToken,
  GithubHttpError,
} from "../oauth/github-app.js";

export const GITHUB_REPOS_PER_PAGE = 100;
export const LINEAR_TEAMS_PAGE_SIZE = 50;

export const GITHUB_ACCESS_LOST_DETAIL =
  "GitHub installation access was revoked or is no longer available. Reconnect GitHub.";
export const LINEAR_ACCESS_LOST_DETAIL =
  "Linear access was revoked or is no longer available. Reconnect Linear.";
export const PROVIDER_RATE_LIMIT_DETAIL =
  "Provider rate limit exceeded. Try again shortly.";
export const PROVIDER_ERROR_DETAIL =
  "Failed to fetch available sources from the provider.";

/** Linear returned HTTP 401; caller may refresh OAuth tokens and retry once. */
export class LinearHttpUnauthorizedError extends Error {
  constructor() {
    super("Linear HTTP 401");
    this.name = "LinearHttpUnauthorizedError";
  }
}

export class ProviderRequestError extends Error {
  readonly statusCode: number;
  readonly detail: string;

  constructor(statusCode: number, detail: string) {
    super(detail);
    this.name = "ProviderRequestError";
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

const LINEAR_AUTH_GRAPHQL_CODES = new Set([
  "AUTHENTICATION_ERROR",
  "FORBIDDEN",
  "JWT_EXPIRED",
  "INVALID_SCOPE",
  "UNAUTHENTICATED",
]);

const LINEAR_TEAMS_QUERY = `
query Teams($after: String, $first: Int!) {
  teams(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name key }
  }
}
`;

export function mapGithubTokenExchangeHttpStatus(
  statusCode: number,
): ProviderRequestError {
  if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
    return new ProviderRequestError(403, GITHUB_ACCESS_LOST_DETAIL);
  }
  if (statusCode === 429) {
    return new ProviderRequestError(429, PROVIDER_RATE_LIMIT_DETAIL);
  }
  return new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
}

export function mapGithubResourceHttpStatus(statusCode: number): ProviderRequestError {
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderRequestError(403, GITHUB_ACCESS_LOST_DETAIL);
  }
  if (statusCode === 429) {
    return new ProviderRequestError(429, PROVIDER_RATE_LIMIT_DETAIL);
  }
  return new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
}

export function mapLinearHttpStatus(statusCode: number): ProviderRequestError {
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderRequestError(403, LINEAR_ACCESS_LOST_DETAIL);
  }
  if (statusCode === 429) {
    return new ProviderRequestError(429, PROVIDER_RATE_LIMIT_DETAIL);
  }
  return new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
}

export function mapLinearGraphqlErrors(
  errors: Array<Record<string, unknown>>,
): ProviderRequestError {
  for (const error of errors) {
    const extensions = (error.extensions as Record<string, unknown> | undefined) ?? {};
    const code = String(extensions.code ?? "").toUpperCase();
    if (LINEAR_AUTH_GRAPHQL_CODES.has(code)) {
      return new ProviderRequestError(403, LINEAR_ACCESS_LOST_DETAIL);
    }
  }
  return new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
}

function parseGithubUpdatedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return null;
  }
  return value;
}

export function githubRepoPayloadToItem(
  repo: Record<string, unknown>,
): AvailableSourceItem {
  const fullName = String(repo.full_name);
  return {
    source_type: "github_repo",
    external_ref: fullName,
    name: fullName,
    private: Boolean(repo.private),
    updated_at: parseGithubUpdatedAt(repo.updated_at),
    key: null,
    already_added: false,
    source_id: null,
  };
}

export function linearTeamPayloadToItem(team: {
  id: string;
  name: string;
  key?: string | null;
}): AvailableSourceItem {
  return {
    source_type: "linear",
    external_ref: String(team.id),
    name: String(team.name),
    private: false,
    updated_at: null,
    key: team.key != null ? String(team.key) : String(team.id),
    already_added: false,
    source_id: null,
  };
}

export function markAlreadyAdded(
  items: AvailableSourceItem[],
  existing: Map<string, string>,
): AvailableSourceItem[] {
  return items.map((item) => {
    const sourceId = existing.get(`${item.source_type}:${item.external_ref}`);
    if (sourceId === undefined) {
      return item;
    }
    return {
      ...item,
      already_added: true,
      source_id: sourceId,
    };
  });
}

export function mergeGithubRepositoryPages(
  pages: Array<Array<Record<string, unknown>>>,
): AvailableSourceItem[] {
  const items: AvailableSourceItem[] = [];
  for (const page of pages) {
    for (const repo of page) {
      items.push(githubRepoPayloadToItem(repo));
    }
  }
  return items;
}

export async function loadExistingSourcesByRef(
  db: D1Database,
  connectionId: string,
  actor: ActorContext,
): Promise<Map<string, string>> {
  const result = await db
    .prepare(
      `SELECT id, source_type, external_ref, user_id, project_id
       FROM knowledge_sources
       WHERE connection_id = ?`,
    )
    .bind(connectionId)
    .all<{
      id: string;
      source_type: SourceType;
      external_ref: string;
      user_id: string | null;
      project_id: string | null;
    }>();

  const existing = new Map<string, string>();
  for (const source of result.results ?? []) {
    if (can_access(actor.userId, actor.projectId, source.user_id, source.project_id)) {
      existing.set(`${source.source_type}:${source.external_ref}`, source.id);
    }
  }
  return existing;
}

export async function fetchGithubInstallationRepositories(
  config: QuorumConfig,
  installationId: string,
): Promise<AvailableSourceItem[]> {
  let accessToken: string;
  try {
    accessToken = await getInstallationAccessToken(config, installationId);
  } catch (error) {
    if (error instanceof GithubHttpError) {
      throw mapGithubTokenExchangeHttpStatus(error.statusCode);
    }
    throw new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
  };
  const pages: Array<Array<Record<string, unknown>>> = [];
  let page = 1;

  try {
    while (true) {
      const url = new URL(`${GITHUB_API_BASE}/installation/repositories`);
      url.searchParams.set("per_page", String(GITHUB_REPOS_PER_PAGE));
      url.searchParams.set("page", String(page));
      const response = await fetch(url.toString(), { headers });
      if (response.status >= 400) {
        throw mapGithubResourceHttpStatus(response.status);
      }
      const payload = (await response.json()) as {
        repositories?: Array<Record<string, unknown>>;
      };
      const batch = payload.repositories ?? [];
      pages.push(batch);
      if (batch.length < GITHUB_REPOS_PER_PAGE) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
  }

  return mergeGithubRepositoryPages(pages);
}

export async function fetchLinearTeams(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AvailableSourceItem[]> {
  const items: AvailableSourceItem[] = [];
  let after: string | null = null;

  try {
    while (true) {
      const response = await fetchImpl("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: LINEAR_TEAMS_QUERY,
          variables: { after, first: LINEAR_TEAMS_PAGE_SIZE },
        }),
      });

      if (response.status === 401) {
        throw new LinearHttpUnauthorizedError();
      }
      if (response.status >= 400) {
        throw mapLinearHttpStatus(response.status);
      }

      const payload = (await response.json()) as {
        errors?: Array<Record<string, unknown>>;
        data?: {
          teams?: {
            nodes?: Array<{ id: string; name: string; key?: string | null }>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        };
      };

      const errors = payload.errors ?? [];
      if (errors.length > 0) {
        throw mapLinearGraphqlErrors(errors);
      }

      const teamsData = payload.data?.teams;
      if (!teamsData) {
        throw new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
      }

      for (const team of teamsData.nodes ?? []) {
        items.push(linearTeamPayloadToItem(team));
      }

      const pageInfo = teamsData.pageInfo;
      if (!pageInfo?.hasNextPage) {
        break;
      }
      after = pageInfo.endCursor ?? null;
    }
  } catch (error) {
    if (
      error instanceof ProviderRequestError ||
      error instanceof LinearHttpUnauthorizedError
    ) {
      throw error;
    }
    throw new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
  }

  return items;
}
