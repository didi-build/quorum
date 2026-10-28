import { describe, expect, it } from "vitest";
import {
  getCouncilChairModel,
  getPersonaModel,
  getRetrievalAnswerModel,
  getSupervisorModel,
  roleModelsFromConfig,
} from "../src/domain/llm/factory.js";
import { loadConfig } from "../src/config/load-config.js";
import { testConfigEnv } from "./fixtures/config-env.js";

describe("LLM role models from config (v1 parity)", () => {
  const config = loadConfig(testConfigEnv);

  it("exposes four independently configured role models", () => {
    const roles = roleModelsFromConfig(config);
    expect(roles.supervisorModel).toBe("claude-haiku-4-5");
    expect(roles.retrievalAnswerModel).toBe("claude-sonnet-5");
    expect(roles.personaModel).toBe("claude-sonnet-5");
    expect(roles.councilChairModel).toBe("claude-sonnet-5");
  });

  it("uses a lighter supervisor model than council chair", () => {
    expect(getSupervisorModel(config)).not.toBe(getCouncilChairModel(config));
    expect(getSupervisorModel(config)).toBe("claude-haiku-4-5");
  });

  it("keeps persona and retrieval answer models on the configured Sonnet id", () => {
    expect(getPersonaModel(config)).toBe("claude-sonnet-5");
    expect(getRetrievalAnswerModel(config)).toBe("claude-sonnet-5");
    expect(getPersonaModel(config)).not.toBe(getSupervisorModel(config));
  });
});
