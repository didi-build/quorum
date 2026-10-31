import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import { buildCitations, buildContext } from "../chat/handlers/retrieval.js";
import {
  getAnthropicClient,
  getPersonaModel,
  PERSONA_TEMPERATURE,
} from "../llm/factory.js";
import { textFromMessageContent } from "../llm/message-content.js";
import { retrieve, type RetrievalSearchDeps } from "../retrieval/service.js";
import type { ActorContext } from "../schemas/actor.js";
import {
  isVerdict,
  type PersonaOpinion,
  type ReviewRequest,
  type Verdict,
} from "../schemas/council.js";
import { emitPersonaStatus, type StatusQueue } from "../chat/status.js";

export const PERSONA_IDS = ["ux", "dev_experience", "business"] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];

/** Verbatim v1 `PERSONA_SYSTEM_PROMPTS` (`domain/council/personas.py`). */
export const PERSONA_SYSTEM_PROMPTS: Record<PersonaId, string> = {
  ux:
    "You are the UX/end-user persona on a decision council. Evaluate proposals from the " +
    "perspective of end-user experience, clarity, and usability. Write in first person. " +
    "Ground your reasoning in the provided knowledge context when available. Choose a verdict: " +
    "approve, request_changes, or comment.",
  dev_experience:
    "You are the developer experience persona on a decision council. Evaluate proposals from " +
    "the perspective of implementation ergonomics, maintainability, and developer workflow. " +
    "Write in first person. Ground your reasoning in the provided knowledge context when " +
    "available. Choose a verdict: approve, request_changes, or comment.",
  business:
    "You are the business/product persona on a decision council. Evaluate proposals from the " +
    "perspective of product value, scope, risk, and roadmap fit. Write in first person. " +
    "Ground your reasoning in the provided knowledge context when available. Choose a verdict: " +
    "approve, request_changes, or comment.",
};

export const PERSONA_OPINION_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["approve", "request_changes", "comment"],
      description: "The persona verdict on the proposal.",
    },
    reasoning: {
      type: "string",
      description: "First-person reasoning grounded in context when available.",
    },
  },
  required: ["verdict", "reasoning"],
  additionalProperties: false,
} as const;

export interface RunPersonaParams {
  persona: PersonaId;
  request: ReviewRequest;
  actor: ActorContext;
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  effectiveProjectId: string | null;
  sessionId: string;
  statusQueue?: StatusQueue;
  client?: Anthropic;
  searchDeps?: RetrievalSearchDeps;
}

interface PersonaOpinionOutput {
  verdict: Verdict;
  reasoning: string;
}

function parsePersonaOutput(rawJson: string): PersonaOpinionOutput {
  if (rawJson.length === 0) {
    throw new Error("Persona model returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Persona model returned non-JSON output");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Persona model returned invalid JSON shape");
  }

  const record = parsed as { verdict?: unknown; reasoning?: unknown };
  if (typeof record.reasoning !== "string" || typeof record.verdict !== "string") {
    throw new Error("Persona model returned an invalid opinion shape");
  }
  if (!isVerdict(record.verdict)) {
    throw new Error("Persona model returned an invalid verdict");
  }

  return { verdict: record.verdict, reasoning: record.reasoning };
}

export async function runPersona(params: RunPersonaParams): Promise<PersonaOpinion> {
  const { persona, request, actor, sessionId, statusQueue } = params;

  if (!(persona in PERSONA_SYSTEM_PROMPTS)) {
    throw new Error(`Unknown persona: ${persona}`);
  }

  await emitPersonaStatus(statusQueue, sessionId, persona, "pondering");
  await emitPersonaStatus(statusQueue, sessionId, persona, "researching");

  const retrieval = await retrieve(
    {
      db: params.db,
      vectorize: params.vectorize,
      config: params.config,
      query: request.query,
      actor,
      effectiveProjectId: params.effectiveProjectId,
    },
    params.searchDeps,
  );

  const context =
    retrieval.chunks.length > 0
      ? buildContext(retrieval.chunks)
      : "No indexed knowledge found.";
  const citations = buildCitations(retrieval.chunks);

  await emitPersonaStatus(statusQueue, sessionId, persona, "giving_recommendation");

  const client = params.client ?? getAnthropicClient(params.config);
  const response = await client.messages.create({
    model: getPersonaModel(params.config),
    max_tokens: 2048,
    temperature: PERSONA_TEMPERATURE,
    system: PERSONA_SYSTEM_PROMPTS[persona],
    messages: [
      {
        role: "user",
        content:
          `Review request:\n${request.query}\n\n` +
          `Knowledge context:\n${context}\n\n` +
          "Provide your verdict and reasoning:",
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: PERSONA_OPINION_SCHEMA,
      },
    },
  });

  const output = parsePersonaOutput(textFromMessageContent(response.content, ""));

  await emitPersonaStatus(statusQueue, sessionId, persona, "recommendation_ready");

  return {
    persona,
    verdict: output.verdict,
    reasoning: output.reasoning,
    citations,
  };
}
