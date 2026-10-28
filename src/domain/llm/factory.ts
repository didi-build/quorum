import Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";

/** Sampling temperature per v1 `domain.llm.factory` init_chat_model settings. */
export const SUPERVISOR_TEMPERATURE = 0;
export const RETRIEVAL_ANSWER_TEMPERATURE = 0.2;
export const PERSONA_TEMPERATURE = 0.2;
export const COUNCIL_CHAIR_TEMPERATURE = 0.2;

/** Explicit SDK limits (defaults are 10 minutes and 2 retries). */
export const ANTHROPIC_CLIENT_TIMEOUT_MS = 120_000;
export const ANTHROPIC_CLIENT_MAX_RETRIES = 0;

export interface RoleModels {
  supervisorModel: string;
  retrievalAnswerModel: string;
  personaModel: string;
  councilChairModel: string;
}

export function roleModelsFromConfig(config: QuorumConfig): RoleModels {
  return {
    supervisorModel: config.supervisorModel,
    retrievalAnswerModel: config.retrievalAnswerModel,
    personaModel: config.personaModel,
    councilChairModel: config.councilChairModel,
  };
}

let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

export type AnthropicApiKeyConfig = Pick<QuorumConfig, "anthropicApiKey">;

/** Shared Anthropic client for chat and council (v1 LangChain init_chat_model roles). */
export function getAnthropicClient(
  config: AnthropicApiKeyConfig,
  fetchImpl: typeof fetch = fetch,
): Anthropic {
  if (cachedClient !== null && cachedApiKey === config.anthropicApiKey) {
    return cachedClient;
  }
  cachedClient = new Anthropic({
    apiKey: config.anthropicApiKey,
    fetch: fetchImpl,
    timeout: ANTHROPIC_CLIENT_TIMEOUT_MS,
    maxRetries: ANTHROPIC_CLIENT_MAX_RETRIES,
  });
  cachedApiKey = config.anthropicApiKey;
  return cachedClient;
}

export function getSupervisorModel(
  config: Pick<QuorumConfig, "supervisorModel">,
): string {
  return config.supervisorModel;
}

export function getRetrievalAnswerModel(
  config: Pick<QuorumConfig, "retrievalAnswerModel">,
): string {
  return config.retrievalAnswerModel;
}

export function getPersonaModel(config: Pick<QuorumConfig, "personaModel">): string {
  return config.personaModel;
}

export function getCouncilChairModel(
  config: Pick<QuorumConfig, "councilChairModel">,
): string {
  return config.councilChairModel;
}

/** Test helper: drop module-level Anthropic client cache. */
export function resetAnthropicClientCacheForTests(): void {
  cachedClient = null;
  cachedApiKey = null;
}
