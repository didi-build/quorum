import { ConfigError } from "./config/errors.js";
import { loadConfig } from "./config/load-config.js";
import type { QuorumConfig } from "./config/types.js";
import type { ActorContext } from "./domain/schemas/actor.js";
import { ensureBootstrapApiKey } from "./domain/auth/api-key.js";
import { resolveWebSocketActor } from "./domain/auth/actor.js";
import {
  isApiPath,
  isPublicApiPath,
  normalizePath,
  notAuthenticatedResponse,
  requiresAuthentication,
} from "./domain/auth/middleware.js";
import type { Env } from "./env.js";
import { handleIndexingQueueBatch } from "./jobs/indexing-consumer.js";
import { purgeExpiredSessions } from "./jobs/session-purge.js";
import type { IndexingQueueMessage } from "./domain/ingestion/indexing-message.js";
import { jsonDetail, workerErrorResponse } from "./http/api-error.js";
import { handleAuthRoute } from "./routes/auth.js";
import { handleChatWebSocket } from "./routes/chat-ws.js";
import { handleConnectionsRoute } from "./routes/connections.js";
import { handleHealth, handleReady } from "./routes/health.js";
import { handleOAuthRoute } from "./routes/oauth.js";
import { handleRetrievalRoute } from "./routes/retrieval.js";
import { handleSourcesRoute } from "./routes/sources.js";

export type { Env } from "./env.js";

export function isAppSpaPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function wantsHtmlDocument(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/html");
}

function appSpaShellRequest(url: URL, request: Request): Request {
  const shellUrl = new URL("/app/index.html", url.origin);
  return new Request(shellUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

export function shouldServeAppShell(
  url: URL,
  request: Request,
  assetResponse: Response,
): boolean {
  if (!isAppSpaPath(url.pathname)) {
    return false;
  }
  if (!wantsHtmlDocument(request)) {
    return false;
  }
  return assetResponse.status === 404 || assetResponse.status === 403;
}

function loadConfigOr503(env: Env): QuorumConfig | Response {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return jsonDetail(error.message, 503);
    }
    throw error;
  }
}

async function handleProtectedApi(
  request: Request,
  env: Env,
  pathname: string,
  config: QuorumConfig,
  actor: ActorContext,
): Promise<Response | null> {
  const oauthResponse = await handleOAuthRoute(request, env, config, pathname, actor);
  if (oauthResponse !== null) {
    return oauthResponse;
  }

  const connectionsResponse = await handleConnectionsRoute(
    request,
    env,
    config,
    pathname,
    actor,
  );
  if (connectionsResponse !== null) {
    return connectionsResponse;
  }

  const authResponse = await handleAuthRoute(request, env, config, pathname);
  if (authResponse !== null) {
    return authResponse;
  }

  const retrievalResponse = await handleRetrievalRoute(
    request,
    env,
    config,
    pathname,
    actor,
  );
  if (retrievalResponse !== null) {
    return retrievalResponse;
  }

  const sourcesResponse = await handleSourcesRoute(
    request,
    env,
    config,
    pathname,
    actor,
  );
  if (sourcesResponse !== null) {
    return sourcesResponse;
  }

  if (isApiPath(pathname)) {
    return jsonDetail("Not Found", 404);
  }

  return null;
}

export default {
  async queue(
    batch: MessageBatch<IndexingQueueMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleIndexingQueueBatch(batch, env);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await purgeExpiredSessions(env.DB);
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = normalizePath(url.pathname);

      if (pathname === "/health") {
        return handleHealth();
      }
      if (pathname === "/ready") {
        return await handleReady(env);
      }

      if (isPublicApiPath(pathname)) {
        const configOrError = loadConfigOr503(env);
        if (configOrError instanceof Response) {
          return configOrError;
        }
        await ensureBootstrapApiKey(env.DB, configOrError);
        const publicOAuth = await handleOAuthRoute(
          request,
          env,
          configOrError,
          pathname,
          null,
        );
        if (publicOAuth !== null) {
          return publicOAuth;
        }

        const publicAuth = await handleAuthRoute(request, env, configOrError, pathname);
        if (publicAuth !== null) {
          return publicAuth;
        }
      }

      if (pathname === "/chat/ws") {
        const configOrError = loadConfigOr503(env);
        if (configOrError instanceof Response) {
          return configOrError;
        }
        await ensureBootstrapApiKey(env.DB, configOrError);
        return await handleChatWebSocket(request, env, configOrError);
      }

      if (requiresAuthentication(pathname)) {
        const configOrError = loadConfigOr503(env);
        if (configOrError instanceof Response) {
          return configOrError;
        }
        const config = configOrError;
        await ensureBootstrapApiKey(env.DB, config);

        const [actor, sessionCredentialRejected] = await resolveWebSocketActor(
          env.DB,
          config,
          request,
        );
        if (actor === null) {
          return notAuthenticatedResponse(config, {
            clearSessionCookie: sessionCredentialRejected,
          });
        }

        const protectedResponse = await handleProtectedApi(
          request,
          env,
          pathname,
          config,
          actor,
        );
        if (protectedResponse !== null) {
          return protectedResponse;
        }
      }

      const assetResponse = await env.ASSETS.fetch(request);

      if (shouldServeAppShell(url, request, assetResponse)) {
        return env.ASSETS.fetch(appSpaShellRequest(url, request));
      }

      return assetResponse;
    } catch (error) {
      return workerErrorResponse(error);
    }
  },
};
