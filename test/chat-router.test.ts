import { describe, expect, it, vi } from "vitest";
import * as orchestratorModule from "../src/domain/council/orchestrator.js";
import * as councilService from "../src/domain/council/service.js";
import { routeMessage } from "../src/domain/chat/router.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import type { ChatIntent } from "../src/domain/schemas/chat.js";
import * as retrievalHandler from "../src/domain/chat/handlers/retrieval.js";
import { testConfigEnv } from "./fixtures/config-env.js";

describe("routeMessage (v1 parity)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000099");
  const sessionId = "00000000-0000-4000-8000-0000000000aa";
  const db = {} as D1Database;
  const vectorize = {} as VectorizeIndex;

  it("routes greeting without calling retrieval", async () => {
    const retrievalSpy = vi.spyOn(retrievalHandler, "handleSimpleRetrieval");

    const response = await routeMessage({
      sessionId,
      message: "Hello!",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "greeting",
    });

    expect(retrievalSpy).not.toHaveBeenCalled();
    expect(response.classified_intent).toBe("greeting");
    expect(response.response_kind).toBe("direct_answer");
    retrievalSpy.mockRestore();
  });

  it("routes strategic_session to council_result via runCouncil", async () => {
    const councilSpy = vi.spyOn(councilService, "runCouncil").mockResolvedValue({
      session_id: sessionId,
      content: "Synthesized plan.",
      classified_intent: "strategic_session",
      response_kind: "council_result",
      citations: [],
      council_decision: {
        persona_opinions: [],
        overall_verdict: "comment",
        synthesis: "Synthesized plan.",
      },
    });

    const response = await routeMessage({
      sessionId,
      message: "Review this proposal",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "strategic_session",
    });

    expect(councilSpy).toHaveBeenCalledOnce();
    expect(response.classified_intent).toBe("strategic_session");
    expect(response.response_kind).toBe("council_result");
    expect(response.content).toBe("Synthesized plan.");
    councilSpy.mockRestore();
  });

  it("emits alerting_council on strategic_session", async () => {
    const updates: Array<{ status: string; session_id: string; scope: string }> = [];
    const statusQueue = {
      enqueue(update: { status: string; session_id: string; scope: string }) {
        updates.push(update);
      },
    };

    vi.spyOn(orchestratorModule, "runCouncilOrchestrator").mockResolvedValue({
      persona_opinions: [],
      overall_verdict: "comment",
      synthesis: "Synthesized plan.",
    });

    await routeMessage({
      sessionId,
      message: "Review this proposal",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "strategic_session",
      statusQueue,
    });

    expect(
      updates.some((u) => u.scope === "supervisor" && u.status === "alerting_council"),
    ).toBe(true);
    vi.restoreAllMocks();
  });

  it("returns Linear stubs as not implemented", async () => {
    const readResponse = await routeMessage({
      sessionId,
      message: "Show Linear issue 1",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "linear_read",
    });
    const writeResponse = await routeMessage({
      sessionId,
      message: "Update Linear issue 1",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "linear_write",
    });

    expect(readResponse.response_kind).toBe("stub_not_implemented");
    expect(writeResponse.response_kind).toBe("stub_not_implemented");
  });

  it("falls back to simple retrieval for an unrecognized intent value", async () => {
    const retrievalSpy = vi
      .spyOn(retrievalHandler, "handleSimpleRetrieval")
      .mockResolvedValue({
        session_id: sessionId,
        content: "fallback",
        classified_intent: "simple_retrieval",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      });

    await routeMessage({
      sessionId,
      message: "edge case",
      actor,
      db,
      vectorize,
      config,
      effectiveProjectId: null,
      intent: "not-a-real-intent" as ChatIntent,
    });

    expect(retrievalSpy).toHaveBeenCalledOnce();
    retrievalSpy.mockRestore();
  });
});
