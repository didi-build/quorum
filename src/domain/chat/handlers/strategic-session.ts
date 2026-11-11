import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../../config/types.js";
import { runCouncil } from "../../council/service.js";
import type { RetrievalSearchDeps } from "../../retrieval/service.js";
import type { ActorContext } from "../../schemas/actor.js";
import type { RoutedChatResponse } from "../../schemas/chat.js";
import type { StatusQueue } from "../status.js";

export interface StrategicSessionParams {
  sessionId: string;
  message: string;
  actor: ActorContext;
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  effectiveProjectId: string | null;
  statusQueue?: StatusQueue;
  client?: Anthropic;
  searchDeps?: RetrievalSearchDeps;
}

/** v1 strategic session handler via council fan-out (`run_council`). */
export async function handleStrategicSession(
  params: StrategicSessionParams,
): Promise<RoutedChatResponse> {
  return runCouncil(params);
}
