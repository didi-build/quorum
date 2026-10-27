import type { QuorumConfig } from "../config/types.js";
import { can_access } from "../domain/permissions.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import { connectionRowToApiItem } from "../domain/connections/connection-api.js";
import {
  availableItemToApiPayload,
  githubAvailableSourcesNotReady,
  loadExistingSourcesByRef,
  markAlreadyAdded,
  ProviderRequestError,
  unsupportedProvider,
} from "../domain/connections/available-sources.js";
import type { ConnectionRow } from "../domain/connections/types.js";
import {
  fetchLinearTeamsForConnection,
  getConnectionById,
  LinearAccessError,
} from "../domain/oauth/linear.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

async function listConnectionsForActor(
  db: Env["DB"],
  actor: ActorContext,
): Promise<ConnectionRow[]> {
  const result = await db
    .prepare(
      `SELECT
        id, user_id, provider, access_token_ciphertext, refresh_token_ciphertext,
        token_expires_at, installation_id, external_account_id, external_account_name,
        created_at, updated_at
      FROM connections`,
    )
    .all<ConnectionRow>();

  return (result.results ?? []).filter((row) =>
    can_access(actor.userId, actor.projectId, row.user_id, null),
  );
}

function connectionNotFound(): Response {
  return jsonDetail("Connection not found", 404);
}

export async function handleConnectionsRoute(
  request: Request,
  env: Env,
  config: QuorumConfig,
  pathname: string,
  actor: ActorContext,
): Promise<Response | null> {
  const method = request.method;

  if (pathname === "/connections" && method === "GET") {
    const rows = await listConnectionsForActor(env.DB, actor);
    return Response.json(rows.map(connectionRowToApiItem));
  }

  const availableMatch = /^\/connections\/([^/]+)\/available-sources$/.exec(pathname);
  if (availableMatch && method === "GET") {
    const connectionId = availableMatch[1];
    const connection = await getConnectionById(env.DB, connectionId);
    if (
      connection === null ||
      !can_access(actor.userId, actor.projectId, connection.user_id, null)
    ) {
      return connectionNotFound();
    }

    const existing = await loadExistingSourcesByRef(env.DB, connectionId, actor);

    try {
      if (connection.provider === "github") {
        if (!connection.installation_id) {
          return jsonDetail(
            "GitHub connection is missing an installation. Reconnect GitHub.",
            403,
          );
        }
        throw githubAvailableSourcesNotReady();
      }

      if (connection.provider === "linear") {
        if (!connection.access_token_ciphertext) {
          return jsonDetail(
            "Linear connection is missing an access token. Reconnect Linear.",
            403,
          );
        }
        const items = await fetchLinearTeamsForConnection(env.DB, config, connection);
        const marked = markAlreadyAdded(items, existing);
        return Response.json(marked.map(availableItemToApiPayload));
      }

      throw unsupportedProvider(connection.provider);
    } catch (error) {
      if (error instanceof LinearAccessError) {
        return jsonDetail(
          "Linear connection is missing an access token. Reconnect Linear.",
          403,
        );
      }
      if (error instanceof ProviderRequestError) {
        return jsonDetail(error.detail, error.statusCode);
      }
      throw error;
    }
  }

  return null;
}
