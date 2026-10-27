import type { ActorContext } from "../schemas/actor.js";
import { can_access } from "../permissions.js";
import type { D1Database } from "@cloudflare/workers-types";
import type {
  AvailableSourceItemInternal,
  ConnectionProvider,
  SourceType,
} from "./types.js";

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
  errors: Array<{ extensions?: { code?: string } }>,
): ProviderRequestError {
  for (const error of errors) {
    const code = String(error.extensions?.code ?? "").toUpperCase();
    if (LINEAR_AUTH_GRAPHQL_CODES.has(code)) {
      return new ProviderRequestError(403, LINEAR_ACCESS_LOST_DETAIL);
    }
  }
  return new ProviderRequestError(502, PROVIDER_ERROR_DETAIL);
}

export function linearTeamPayloadToItem(team: {
  id: string;
  name: string;
  key?: string | null;
}): AvailableSourceItemInternal {
  return {
    source_type: "linear",
    external_ref: String(team.id),
    name: String(team.name),
    private: false,
    key: team.key != null ? String(team.key) : String(team.id),
    already_added: false,
    source_id: null,
  };
}

export function markAlreadyAdded(
  items: AvailableSourceItemInternal[],
  existing: Map<string, string>,
): AvailableSourceItemInternal[] {
  return items.map((item) => {
    const sourceId = existing.get(item.external_ref);
    if (!sourceId) {
      return item;
    }
    return {
      ...item,
      already_added: true,
      source_id: sourceId,
    };
  });
}

export async function loadExistingSourcesByRef(
  db: D1Database,
  connectionId: string,
  actor: ActorContext,
): Promise<Map<string, string>> {
  const result = await db
    .prepare(
      `SELECT id, user_id, project_id, source_type, external_ref
       FROM knowledge_sources
       WHERE connection_id = ?`,
    )
    .bind(connectionId)
    .all<{
      id: string;
      user_id: string | null;
      project_id: string | null;
      source_type: SourceType;
      external_ref: string;
    }>();

  const existing = new Map<string, string>();
  for (const source of result.results ?? []) {
    if (can_access(actor.userId, actor.projectId, source.user_id, source.project_id)) {
      existing.set(source.external_ref, source.id);
    }
  }
  return existing;
}

export function availableItemToApiPayload(item: AvailableSourceItemInternal): {
  name: string;
  external_ref: string;
  private: boolean;
  key: string;
  already_added: boolean;
} {
  return {
    name: item.name,
    external_ref: item.external_ref,
    private: item.private ?? false,
    key: item.key ?? item.external_ref,
    already_added: item.already_added,
  };
}

export const LINEAR_TEAMS_PAGE_SIZE = 50;

const LINEAR_TEAMS_QUERY = `
query Teams($after: String, $first: Int!) {
  teams(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name key }
  }
}
`;

export type LinearFetch = typeof fetch;

export async function fetchLinearTeams(
  accessToken: string,
  fetchImpl: LinearFetch = fetch,
): Promise<AvailableSourceItemInternal[]> {
  const items: AvailableSourceItemInternal[] = [];
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
        errors?: Array<{ extensions?: { code?: string } }>;
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

export function githubAvailableSourcesNotReady(): ProviderRequestError {
  return new ProviderRequestError(503, "GitHub App connection is not available yet");
}

export function unsupportedProvider(
  _provider: ConnectionProvider,
): ProviderRequestError {
  return new ProviderRequestError(502, "Unsupported connection provider");
}
