import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_CLIENT_MAX_RETRIES,
  ANTHROPIC_CLIENT_TIMEOUT_MS,
  COUNCIL_CHAIR_TEMPERATURE,
  getAnthropicClient,
  getCouncilChairModel,
  getPersonaModel,
  getRetrievalAnswerModel,
  getSupervisorModel,
  PERSONA_TEMPERATURE,
  resetAnthropicClientCacheForTests,
  RETRIEVAL_ANSWER_TEMPERATURE,
  roleModelsFromConfig,
  SUPERVISOR_TEMPERATURE,
} from "../src/domain/llm/factory.js";
import { loadConfig } from "../src/config/load-config.js";
import { testConfigEnv, withTestConfigEnv } from "./fixtures/config-env.js";

const anthropicConstructOptions: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor(options: unknown) {
      anthropicConstructOptions.push(options);
    }
  },
}));

describe("LLM role models from config (v1 parity)", () => {
  const config = loadConfig(testConfigEnv);

  it("exposes four independently configured role models", () => {
    const roles = roleModelsFromConfig(config);
    expect(roles.supervisorModel).toBe("claude-haiku-4-5");
    expect(roles.retrievalAnswerModel).toBe("claude-sonnet-5");
    expect(roles.personaModel).toBe("claude-sonnet-5");
    expect(roles.councilChairModel).toBe("claude-sonnet-5");
  });

  it("maps each getter to the configured model id", () => {
    const distinct = loadConfig(
      withTestConfigEnv({
        SUPERVISOR_MODEL: "supervisor-model-id",
        RETRIEVAL_ANSWER_MODEL: "retrieval-model-id",
        PERSONA_MODEL: "persona-model-id",
        COUNCIL_CHAIR_MODEL: "chair-model-id",
      }),
    );
    expect(getSupervisorModel(distinct)).toBe("supervisor-model-id");
    expect(getRetrievalAnswerModel(distinct)).toBe("retrieval-model-id");
    expect(getPersonaModel(distinct)).toBe("persona-model-id");
    expect(getCouncilChairModel(distinct)).toBe("chair-model-id");
  });

  it("keeps v1 sampling temperatures as named constants", () => {
    expect(SUPERVISOR_TEMPERATURE).toBe(0);
    expect(RETRIEVAL_ANSWER_TEMPERATURE).toBe(0.2);
    expect(PERSONA_TEMPERATURE).toBe(0.2);
    expect(COUNCIL_CHAIR_TEMPERATURE).toBe(0.2);
  });

  it("configures explicit Anthropic client timeout and retry limits", () => {
    resetAnthropicClientCacheForTests();
    anthropicConstructOptions.length = 0;
    getAnthropicClient(config);
    expect(anthropicConstructOptions[0]).toMatchObject({
      timeout: ANTHROPIC_CLIENT_TIMEOUT_MS,
      maxRetries: ANTHROPIC_CLIENT_MAX_RETRIES,
    });
    resetAnthropicClientCacheForTests();
  });
});
