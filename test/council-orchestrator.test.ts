import { describe, expect, it, vi } from "vitest";
import * as chairModule from "../src/domain/council/chair.js";
import { runCouncilOrchestrator } from "../src/domain/council/orchestrator.js";
import { PERSONA_IDS } from "../src/domain/council/personas.js";
import * as orchestratorModule from "../src/domain/council/orchestrator.js";
import { runCouncil } from "../src/domain/council/service.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type {
  CouncilDecision,
  PersonaOpinion,
  ReviewRequest,
} from "../src/domain/schemas/common.js";
import { testConfigEnv } from "./fixtures/config-env.js";

function makeOpinion(persona: string): PersonaOpinion {
  return {
    persona,
    verdict: "comment",
    reasoning: `${persona} reasoning`,
    citations: [
      {
        document_id: `doc-${persona}`,
        chunk_index: 0,
        knowledge_source_id: "00000000-0000-4000-8000-000000000010",
        excerpt: "excerpt",
      },
    ],
  };
}

function makeDecision(opinions: PersonaOpinion[]): CouncilDecision {
  return {
    persona_opinions: opinions,
    overall_verdict: "comment",
    synthesis: "The council recommends proceeding with caution.",
  };
}

describe("runCouncilOrchestrator (v1 test_council_graph parity)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const request: ReviewRequest = {
    query: "Should we migrate chunking to semantic splitting?",
    project_id: null,
  };
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  it("invokes all three personas then the chair", async () => {
    const invokedPersonas: string[] = [];

    const runPersonaFn = vi.fn(
      async (params: { persona: string }): Promise<PersonaOpinion> => {
        invokedPersonas.push(params.persona);
        return makeOpinion(params.persona);
      },
    );

    const opinions = PERSONA_IDS.map((persona) => makeOpinion(persona));
    const synthesizeSpy = vi
      .spyOn(chairModule, "synthesizeDecision")
      .mockResolvedValue(makeDecision(opinions));

    const decision = await runCouncilOrchestrator({
      request,
      actor,
      sessionId,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      runPersonaFn,
    });

    expect(sorted(invokedPersonas)).toEqual(sorted([...PERSONA_IDS]));
    expect(runPersonaFn).toHaveBeenCalledTimes(3);
    expect(synthesizeSpy).toHaveBeenCalledOnce();
    expect(decision.persona_opinions).toHaveLength(3);
    expect(new Set(decision.persona_opinions.map((o) => o.persona))).toEqual(
      new Set(PERSONA_IDS),
    );
    expect(decision.synthesis).toBe("The council recommends proceeding with caution.");

    synthesizeSpy.mockRestore();
  });
});

describe("runCouncil (v1 test_run_council parity)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  it("returns council_result with synthesis content", async () => {
    const opinions = PERSONA_IDS.map((persona) => makeOpinion(persona));
    const decision = makeDecision(opinions);

    const orchestratorSpy = vi
      .spyOn(orchestratorModule, "runCouncilOrchestrator")
      .mockResolvedValue(decision);

    const response = await runCouncil({
      sessionId,
      message: "Review this proposal",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
    });

    expect(response.response_kind).toBe("council_result");
    expect(response.classified_intent).toBe("strategic_session");
    expect(response.content).toBe(decision.synthesis);
    expect(response.council_decision).toEqual(decision);
    expect(response.citations).toEqual([]);

    orchestratorSpy.mockRestore();
  });
});

function sorted(values: string[]): string[] {
  return [...values].sort();
}
