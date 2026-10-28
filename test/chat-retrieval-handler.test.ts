import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildCitations,
  handleSimpleRetrieval,
  NO_KNOWLEDGE_ANSWER,
  RETRIEVAL_SYSTEM_PROMPT,
} from "../src/domain/chat/handlers/retrieval.js";
import { RETRIEVAL_ANSWER_TEMPERATURE } from "../src/domain/llm/factory.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type { RetrievedChunk } from "../src/domain/schemas/retrieval.js";
import * as retrievalService from "../src/domain/retrieval/service.js";
import { testConfigEnv, withTestConfigEnv } from "./fixtures/config-env.js";

describe("handleSimpleRetrieval (mocked client)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  const sampleChunk: RetrievedChunk = {
    chunk_id: 1,
    knowledge_source_id: "00000000-0000-4000-8000-000000000010",
    document_id: "didi-build/quorum/src/example.ts",
    chunk_index: 3,
    content: "x".repeat(300),
    heading_hierarchy: ["Architecture", "Retrieval"],
    rrf_score: 0.5,
    vector_rank: 1,
    keyword_rank: 2,
  };

  it("returns the no-knowledge reply when retrieve finds no chunks", async () => {
    vi.spyOn(retrievalService, "retrieve").mockResolvedValue({
      query: "q",
      chunks: [],
      coverage_sufficient: false,
      coverage_score: 0,
      expanded: false,
    });

    const response = await handleSimpleRetrieval({
      sessionId,
      message: "What is RRF?",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
    });

    expect(response.content).toBe(NO_KNOWLEDGE_ANSWER);
    expect(response.citations).toEqual([]);
    vi.restoreAllMocks();
  });

  it("calls RETRIEVAL_ANSWER_MODEL once with temperature 0.2 and v1 system prompt", async () => {
    vi.spyOn(retrievalService, "retrieve").mockResolvedValue({
      query: "q",
      chunks: [{ ...sampleChunk, content: "answer context" }],
      coverage_sufficient: true,
      coverage_score: 1,
      expanded: false,
    });

    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "The answer." }],
    });
    const client = { messages: { create } } as unknown as Anthropic;

    await handleSimpleRetrieval({
      sessionId,
      message: "What is RRF?",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      client,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: config.retrievalAnswerModel,
      temperature: RETRIEVAL_ANSWER_TEMPERATURE,
      system: RETRIEVAL_SYSTEM_PROMPT,
    });
    vi.restoreAllMocks();
  });

  it("builds citations with source id, document id, chunk index, and 240-char excerpts", () => {
    const citations = buildCitations([sampleChunk]);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.knowledge_source_id).toBe(sampleChunk.knowledge_source_id);
    expect(citations[0]?.document_id).toBe(sampleChunk.document_id);
    expect(citations[0]?.document_id).not.toBe(citations[0]?.knowledge_source_id);
    expect(citations[0]?.chunk_index).toBe(3);
    expect(citations[0]?.excerpt).toBe(`${"x".repeat(240)}...`);
  });
});

describe("LLM role getters with distinct configured models", () => {
  it("maps each role to its own model id from env", () => {
    const config = loadConfig(
      withTestConfigEnv({
        SUPERVISOR_MODEL: "supervisor-model-id",
        RETRIEVAL_ANSWER_MODEL: "retrieval-model-id",
        PERSONA_MODEL: "persona-model-id",
        COUNCIL_CHAIR_MODEL: "chair-model-id",
      }),
    );
    expect(config.supervisorModel).toBe("supervisor-model-id");
    expect(config.retrievalAnswerModel).toBe("retrieval-model-id");
    expect(config.personaModel).toBe("persona-model-id");
    expect(config.councilChairModel).toBe("chair-model-id");
  });
});
