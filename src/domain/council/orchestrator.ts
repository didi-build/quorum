import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import { emitSupervisorStatus, type StatusQueue } from "../chat/status.js";
import type { RetrievalSearchDeps } from "../retrieval/service.js";
import type { ActorContext } from "../schemas/actor.js";
import type { CouncilDecision, ReviewRequest } from "../schemas/council.js";
import { synthesizeDecision } from "./chair.js";
import { PERSONA_IDS, runPersona, type PersonaId } from "./personas.js";

export interface RunCouncilOrchestratorParams {
  request: ReviewRequest;
  actor: ActorContext;
  sessionId: string;
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  effectiveProjectId: string | null;
  statusQueue?: StatusQueue;
  client?: Anthropic;
  searchDeps?: RetrievalSearchDeps;
  /** Test hook: override persona runner (v1 patches `run_persona` on the graph). */
  runPersonaFn?: typeof runPersona;
}

/** Plain TypeScript fan-out replacing v1 LangGraph council subgraph (ADR 0004). */
export async function runCouncilOrchestrator(
  params: RunCouncilOrchestratorParams,
): Promise<CouncilDecision> {
  const runPersonaImpl = params.runPersonaFn ?? runPersona;

  await emitSupervisorStatus(
    params.statusQueue,
    params.sessionId,
    "waiting_on_council",
  );

  const personaOpinions = await Promise.all(
    PERSONA_IDS.map((persona: PersonaId) =>
      runPersonaImpl({
        persona,
        request: params.request,
        actor: params.actor,
        db: params.db,
        vectorize: params.vectorize,
        config: params.config,
        effectiveProjectId: params.effectiveProjectId,
        sessionId: params.sessionId,
        statusQueue: params.statusQueue,
        client: params.client,
        searchDeps: params.searchDeps,
      }),
    ),
  );

  await emitSupervisorStatus(
    params.statusQueue,
    params.sessionId,
    "council_deliberating",
  );

  return synthesizeDecision({
    personaOpinions,
    config: params.config,
    client: params.client,
  });
}
