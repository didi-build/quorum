import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import { emitSupervisorStatus, type StatusQueue } from "../chat/status.js";
import type { RetrievalSearchDeps } from "../retrieval/service.js";
import type { ActorContext } from "../schemas/actor.js";
import type { RoutedChatResponse } from "../schemas/chat.js";
import type { ReviewRequest } from "../schemas/common.js";
import {
  runCouncilOrchestrator,
  type RunCouncilOrchestratorParams,
} from "./orchestrator.js";

export interface RunCouncilParams {
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
  orchestratorOverrides?: Pick<RunCouncilOrchestratorParams, "runPersonaFn">;
}

/** v1 `run_council` (`domain/council/service.py`). */
export async function runCouncil(
  params: RunCouncilParams,
): Promise<RoutedChatResponse> {
  const request: ReviewRequest = {
    query: params.message,
    project_id: params.actor.projectId,
  };

  await emitSupervisorStatus(params.statusQueue, params.sessionId, "alerting_council");

  const decision = await runCouncilOrchestrator({
    request,
    actor: params.actor,
    sessionId: params.sessionId,
    db: params.db,
    vectorize: params.vectorize,
    config: params.config,
    effectiveProjectId: params.effectiveProjectId,
    statusQueue: params.statusQueue,
    client: params.client,
    searchDeps: params.searchDeps,
    runPersonaFn: params.orchestratorOverrides?.runPersonaFn,
  });

  return {
    session_id: params.sessionId,
    content: decision.synthesis,
    classified_intent: "strategic_session",
    response_kind: "council_result",
    citations: [],
    council_decision: decision,
  };
}
