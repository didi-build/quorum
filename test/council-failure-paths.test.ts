import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeDecision } from "../src/domain/council/chair.js";
import { runCouncilOrchestrator } from "../src/domain/council/orchestrator.js";
import { runPersona } from "../src/domain/council/personas.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type { PersonaOpinion, ReviewRequest } from "../src/domain/schemas/council.js";
import * as retrievalService from "../src/domain/retrieval/service.js";
import * as chairModule from "../src/domain/council/chair.js";
import { testConfigEnv } from "./fixtures/config-env.js";

describe("runPersona failure paths (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const request: ReviewRequest = {
    query: "Review this proposal",
    project_id: null,
  };
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  beforeEach(() => {
    vi.spyOn(retrievalService, "retrieve").mockResolvedValue({
      query: request.query,
      chunks: [],
      coverage_sufficient: false,
      coverage_score: 0,
      expanded: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function clientReturningText(text: string): Anthropic {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text }],
        }),
      },
    } as unknown as Anthropic;
  }

  const baseParams = {
    persona: "ux" as const,
    request,
    actor,
    db,
    vectorize,
    config,
    effectiveProjectId: null,
    sessionId,
  };

  it("rejects non-JSON output", async () => {
    await expect(
      runPersona({ ...baseParams, client: clientReturningText("not json") }),
    ).rejects.toThrow("Persona model returned non-JSON output");
  });

  it("rejects invalid verdict", async () => {
    await expect(
      runPersona({
        ...baseParams,
        client: clientReturningText(
          JSON.stringify({ verdict: "maybe", reasoning: "unsure" }),
        ),
      }),
    ).rejects.toThrow("Persona model returned an invalid verdict");
  });

  it("rejects empty text response", async () => {
    await expect(
      runPersona({ ...baseParams, client: clientReturningText("") }),
    ).rejects.toThrow("Persona model returned an empty response");
  });

  it("rejects non-text content blocks", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
        }),
      },
    } as unknown as Anthropic;

    await expect(runPersona({ ...baseParams, client })).rejects.toThrow(
      "Persona model returned an empty response",
    );
  });

  it("rejects truncated JSON", async () => {
    await expect(
      runPersona({
        ...baseParams,
        client: clientReturningText('{"verdict": "comment", "reasoning":'),
      }),
    ).rejects.toThrow("Persona model returned non-JSON output");
  });

  it("rejects truncated response with stop_reason max_tokens", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: "max_tokens",
          content: [
            { type: "text", text: '{"verdict": "comment", "reasoning": "cut off' },
          ],
        }),
      },
    } as unknown as Anthropic;

    await expect(runPersona({ ...baseParams, client })).rejects.toThrow(
      "Persona model returned non-JSON output",
    );
  });

  it("rejects empty content array", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
        }),
      },
    } as unknown as Anthropic;

    await expect(runPersona({ ...baseParams, client })).rejects.toThrow(
      "Persona model returned an empty response",
    );
  });

  it("propagates rejected messages.create", async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      },
    } as unknown as Anthropic;

    await expect(runPersona({ ...baseParams, client })).rejects.toThrow(
      "provider unavailable",
    );
  });
});

describe("synthesizeDecision failure paths (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const opinions: PersonaOpinion[] = [
    {
      persona: "ux",
      verdict: "comment",
      reasoning: "ux reasoning",
      citations: [],
    },
  ];

  function clientReturningText(text: string): Anthropic {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text }],
        }),
      },
    } as unknown as Anthropic;
  }

  it("rejects non-JSON output", async () => {
    await expect(
      synthesizeDecision({
        personaOpinions: opinions,
        config,
        client: clientReturningText("not json"),
      }),
    ).rejects.toThrow("Council chair model returned non-JSON output");
  });

  it("rejects invalid overall verdict", async () => {
    await expect(
      synthesizeDecision({
        personaOpinions: opinions,
        config,
        client: clientReturningText(
          JSON.stringify({ overall_verdict: "maybe", synthesis: "text" }),
        ),
      }),
    ).rejects.toThrow("Council chair model returned an invalid overall verdict");
  });

  it("rejects empty text response", async () => {
    await expect(
      synthesizeDecision({
        personaOpinions: opinions,
        config,
        client: clientReturningText(""),
      }),
    ).rejects.toThrow("Council chair model returned an empty response");
  });

  it("rejects non-text content blocks", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "thinking", thinking: "hidden" }],
        }),
      },
    } as unknown as Anthropic;

    await expect(
      synthesizeDecision({ personaOpinions: opinions, config, client }),
    ).rejects.toThrow("Council chair model returned an empty response");
  });

  it("rejects truncated JSON", async () => {
    await expect(
      synthesizeDecision({
        personaOpinions: opinions,
        config,
        client: clientReturningText('{"overall_verdict": "comment", "synthesis":'),
      }),
    ).rejects.toThrow("Council chair model returned non-JSON output");
  });

  it("rejects non-string synthesis", async () => {
    await expect(
      synthesizeDecision({
        personaOpinions: opinions,
        config,
        client: clientReturningText(
          JSON.stringify({ overall_verdict: "comment", synthesis: 42 }),
        ),
      }),
    ).rejects.toThrow("Council chair model returned an invalid synthesis shape");
  });

  it("propagates rejected messages.create", async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("chair provider down")),
      },
    } as unknown as Anthropic;

    await expect(
      synthesizeDecision({ personaOpinions: opinions, config, client }),
    ).rejects.toThrow("chair provider down");
  });
});

describe("runCouncilOrchestrator persona rejection", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const request: ReviewRequest = {
    query: "Should we migrate chunking to semantic splitting?",
    project_id: null,
  };
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  it("does not call the chair when a persona rejects", async () => {
    const synthesizeSpy = vi.spyOn(chairModule, "synthesizeDecision");
    const personaError = new Error("persona model failed");

    await expect(
      runCouncilOrchestrator({
        request,
        actor,
        sessionId,
        db,
        vectorize,
        config,
        effectiveProjectId: null,
        runPersonaFn: vi.fn(async (params): Promise<PersonaOpinion> => {
          if (params.persona === "ux") {
            throw personaError;
          }
          return {
            persona: params.persona,
            verdict: "comment",
            reasoning: `${params.persona} reasoning`,
            citations: [],
          };
        }),
      }),
    ).rejects.toThrow("persona model failed");

    expect(synthesizeSpy).not.toHaveBeenCalled();
    synthesizeSpy.mockRestore();
  });
});
