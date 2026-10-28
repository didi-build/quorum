import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAIR_SYSTEM_PROMPT,
  synthesizeDecision,
} from "../src/domain/council/chair.js";
import { runCouncilOrchestrator } from "../src/domain/council/orchestrator.js";
import {
  PERSONA_IDS,
  PERSONA_SYSTEM_PROMPTS,
  runPersona,
} from "../src/domain/council/personas.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type { PersonaOpinion, ReviewRequest } from "../src/domain/schemas/council.js";
import type { RetrievedChunk } from "../src/domain/schemas/retrieval.js";
import * as retrievalService from "../src/domain/retrieval/service.js";
import { testConfigEnv } from "./fixtures/config-env.js";

describe("runPersona happy path (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const request: ReviewRequest = {
    query: "Review this proposal",
    project_id: null,
  };
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  const chunk: RetrievedChunk = {
    chunk_id: 1,
    knowledge_source_id: "00000000-0000-4000-8000-000000000010",
    document_id: "docs/adr.md",
    chunk_index: 2,
    content: "Council retrieves indexed knowledge for each persona.",
    heading_hierarchy: ["Architecture"],
    rrf_score: 0.4,
    vector_rank: 1,
    keyword_rank: 1,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls PERSONA_MODEL with persona prompt, query, and chunk citations", async () => {
    vi.spyOn(retrievalService, "retrieve").mockResolvedValue({
      query: request.query,
      chunks: [chunk],
      coverage_sufficient: true,
      coverage_score: 1,
      expanded: false,
    });

    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            verdict: "comment",
            reasoning: "I see relevant context.",
          }),
        },
      ],
    });
    const client = { messages: { create } } as unknown as Anthropic;

    const opinion = await runPersona({
      persona: "ux",
      request,
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      sessionId,
      client,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: config.personaModel,
      system: PERSONA_SYSTEM_PROMPTS.ux,
    });
    const userContent = create.mock.calls[0]?.[0].messages[0]?.content as string;
    expect(userContent).toContain(`Review request:\n${request.query}`);
    expect(userContent).toContain("document_id=docs/adr.md chunk_index=2");
    expect(opinion.citations).toEqual([
      {
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        knowledge_source_id: chunk.knowledge_source_id,
        excerpt: chunk.content,
      },
    ]);
  });
});

describe("synthesizeDecision happy path (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const personaOpinions: PersonaOpinion[] = PERSONA_IDS.map((persona) => ({
    persona,
    verdict: "comment",
    reasoning: `${persona} reasoning`,
    citations: [],
  }));

  it("calls COUNCIL_CHAIR_MODEL with chair prompt and all three opinions", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            overall_verdict: "comment",
            synthesis: "Proceed with caution.",
          }),
        },
      ],
    });
    const client = { messages: { create } } as unknown as Anthropic;

    const decision = await synthesizeDecision({
      personaOpinions,
      config,
      client,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: config.councilChairModel,
      system: CHAIR_SYSTEM_PROMPT,
    });
    const userContent = create.mock.calls[0]?.[0].messages[0]?.content as string;
    for (const persona of PERSONA_IDS) {
      expect(userContent).toContain(`Persona: ${persona}`);
      expect(userContent).toContain(`${persona} reasoning`);
    }
    expect(decision.persona_opinions).toBe(personaOpinions);
    expect(decision.synthesis).toBe("Proceed with caution.");
  });
});

describe("runCouncilOrchestrator chair ordering (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const request: ReviewRequest = {
    query: "Should we ship council fan-out?",
    project_id: null,
  };
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the chair only after all personas resolve with their opinions", async () => {
    vi.spyOn(retrievalService, "retrieve").mockResolvedValue({
      query: request.query,
      chunks: [],
      coverage_sufficient: false,
      coverage_score: 0,
      expanded: false,
    });

    const personaResolvedAt: number[] = [];
    let chairInvokedAt = 0;

    const create = vi.fn(async (apiRequest: { system?: string }) => {
      const isChair =
        typeof apiRequest.system === "string" &&
        apiRequest.system.includes("chair of a decision council");
      if (isChair) {
        chairInvokedAt = performance.now();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overall_verdict: "comment",
                synthesis: "Synthesis.",
              }),
            },
          ],
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      personaResolvedAt.push(performance.now());
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              verdict: "comment",
              reasoning: "Persona view.",
            }),
          },
        ],
      };
    });
    const client = { messages: { create } } as unknown as Anthropic;

    const decision = await runCouncilOrchestrator({
      request,
      actor,
      sessionId,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      client,
    });

    expect(create).toHaveBeenCalledTimes(4);
    expect(personaResolvedAt).toHaveLength(3);
    expect(chairInvokedAt).toBeGreaterThan(0);
    expect(chairInvokedAt).toBeGreaterThanOrEqual(Math.max(...personaResolvedAt) - 5);
    expect(decision.persona_opinions.map((o) => o.persona).sort()).toEqual(
      [...PERSONA_IDS].sort(),
    );
    expect(create.mock.calls[3]?.[0]).toMatchObject({
      system: CHAIR_SYSTEM_PROMPT,
    });
    const chairUserContent = (
      create.mock.calls[3]?.[0] as { messages: Array<{ content: string }> }
    ).messages[0]?.content;
    for (const persona of PERSONA_IDS) {
      expect(chairUserContent).toContain(`Persona: ${persona}`);
    }
  });
});
