import type { QuorumConfig } from "../../config/types.js";
import { classifyIntent, type ClassifierDeps } from "./classifier.js";
import { handleGreeting } from "./handlers/greeting.js";
import { handleLinearRead, handleLinearWrite } from "./handlers/linear.js";
import { handleSimpleRetrieval } from "./handlers/retrieval.js";
import { handleStrategicSession } from "./handlers/strategic-session.js";
import type { StatusQueue } from "./status.js";
import type { ActorContext } from "../schemas/actor.js";
import type { ChatIntent, RoutedChatResponse } from "../schemas/chat.js";
import type { RetrievalSearchDeps } from "../retrieval/service.js";

export interface RouteMessageParams {
  sessionId: string;
  message: string;
  actor: ActorContext;
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  effectiveProjectId: string | null;
  intent?: ChatIntent;
  statusQueue?: StatusQueue;
  classifierDeps?: ClassifierDeps;
  retrievalSearchDeps?: RetrievalSearchDeps;
}

export async function routeMessage(
  params: RouteMessageParams,
): Promise<RoutedChatResponse> {
  const resolvedIntent =
    params.intent ??
    (await classifyIntent(params.message, {
      config: params.config,
      ...params.classifierDeps,
    }));

  if (resolvedIntent === "greeting") {
    return handleGreeting(params.sessionId, params.message);
  }
  if (resolvedIntent === "simple_retrieval") {
    return handleSimpleRetrieval({
      sessionId: params.sessionId,
      message: params.message,
      actor: params.actor,
      db: params.db,
      vectorize: params.vectorize,
      config: params.config,
      effectiveProjectId: params.effectiveProjectId,
      searchDeps: params.retrievalSearchDeps,
    });
  }
  if (resolvedIntent === "strategic_session") {
    return handleStrategicSession(params.sessionId, params.message, params.statusQueue);
  }
  if (resolvedIntent === "linear_read") {
    return handleLinearRead(params.sessionId, params.message);
  }
  if (resolvedIntent === "linear_write") {
    return handleLinearWrite(params.sessionId, params.message);
  }

  return handleSimpleRetrieval({
    sessionId: params.sessionId,
    message: params.message,
    actor: params.actor,
    db: params.db,
    vectorize: params.vectorize,
    config: params.config,
    effectiveProjectId: params.effectiveProjectId,
    searchDeps: params.retrievalSearchDeps,
  });
}
