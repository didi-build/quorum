import type { QuorumConfig } from "../config/types.js";
import { deleteConnection } from "../domain/connections/delete-connection.js";
import {
  connectionRowToRead,
  getConnectionById,
  listConnectionsByUserId,
} from "../domain/db/connections.js";
import {
  fetchGithubInstallationRepositories,
  LINEAR_ACCESS_LOST_DETAIL,
  loadExistingSourcesByRef,
  markAlreadyAdded,
  ProviderRequestError,
} from "../domain/connections/available-sources.js";
import {
  fetchLinearTeamsForConnection,
  LinearAccessError,
  LinearReconnectRequiredError,
} from "../domain/oauth/linear.js";
import { can_access } from "../domain/permissions.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

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
    const rows = await listConnectionsByUserId(env.DB, actor.userId);
    const connections = rows
      .filter((row) => can_access(actor.userId, actor.projectId, row.user_id, null))
      .map(connectionRowToRead);
    return Response.json({ connections });
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

    if (connection.provider === "github") {
      if (!connection.installation_id) {
        return jsonDetail(
          "GitHub connection is missing an installation. Reconnect GitHub.",
          403,
        );
      }
      const existing = await loadExistingSourcesByRef(env.DB, connectionId, actor);
      try {
        const items = await fetchGithubInstallationRepositories(
          config,
          connection.installation_id,
        );
        return Response.json({
          provider: "github",
          items: markAlreadyAdded(items, existing),
        });
      } catch (error) {
        if (error instanceof ProviderRequestError) {
          return jsonDetail(error.detail, error.statusCode);
        }
        throw error;
      }
    }

    if (connection.provider === "linear") {
      if (!connection.access_token_ciphertext) {
        return jsonDetail(
          "Linear connection is missing an access token. Reconnect Linear.",
          403,
        );
      }
      const existing = await loadExistingSourcesByRef(env.DB, connectionId, actor);
      try {
        const items = await fetchLinearTeamsForConnection(env.DB, config, connection);
        return Response.json({
          provider: "linear",
          items: markAlreadyAdded(items, existing),
        });
      } catch (error) {
        if (
          error instanceof LinearReconnectRequiredError ||
          error instanceof LinearAccessError
        ) {
          return jsonDetail(LINEAR_ACCESS_LOST_DETAIL, 403);
        }
        if (error instanceof ProviderRequestError) {
          return jsonDetail(error.detail, error.statusCode);
        }
        throw error;
      }
    }

    return jsonDetail("Unsupported connection provider", 502);
  }

  const connectionMatch = /^\/connections\/([^/]+)$/.exec(pathname);
  if (connectionMatch) {
    const connectionId = connectionMatch[1];
    const connection = await getConnectionById(env.DB, connectionId);
    if (
      connection === null ||
      !can_access(actor.userId, actor.projectId, connection.user_id, null)
    ) {
      return connectionNotFound();
    }

    if (method === "GET") {
      return Response.json(connectionRowToRead(connection));
    }
    if (method === "DELETE") {
      await deleteConnection(env.DB, env.VECTORIZE, connectionId);
      return new Response(null, { status: 204 });
    }
  }

  return null;
}
