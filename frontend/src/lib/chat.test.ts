import { describe, expect, it } from "vitest";
import {
  historyToThreadItems,
  threadItemFromResponse,
  threadItemsFromHistoryMessage,
} from "./chat/history";
import { responseKindRouteLabel } from "./chat/labels";
import { isChatResponse, isChatStatusUpdate } from "../types/chat";
import {
  isChatResponseFrame,
  isCitation,
  parseIncomingFrame,
} from "./chat/frameGuards";
import {
  FIXTURE_DIRECT_RESPONSE,
  FIXTURE_STUB_RESPONSE,
} from "./chat/transport/fixtures";

const SESSION = "00000000-0000-4000-8000-000000000001";

describe("frame guards", () => {
  it("distinguishes status updates from final responses", () => {
    expect(
      isChatStatusUpdate({
        session_id: SESSION,
        scope: "supervisor",
        persona: null,
        status: "alerting_council",
      }),
    ).toBe(true);
    expect(
      isChatResponse({
        id: "00000000-0000-4000-8000-000000000002",
        session_id: SESSION,
        content: "Hello",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      }),
    ).toBe(true);
  });

  it("rejects malformed response frames", () => {
    expect(isChatResponseFrame(null)).toBe(false);
    expect(isChatResponseFrame("text")).toBe(false);
    expect(
      isChatResponseFrame({
        id: "x",
        session_id: SESSION,
        content: "Hi",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [{ bad: true }],
        council_decision: null,
      }),
    ).toBe(false);
    expect(
      isChatResponseFrame({
        id: "x",
        session_id: SESSION,
        content: 1,
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      }),
    ).toBe(false);
  });

  it("drops frames for another session", () => {
    const frame = parseIncomingFrame(
      {
        id: "m1",
        session_id: "other-session",
        content: "Hi",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      },
      SESSION,
    );
    expect(frame).toBeNull();
  });

  it("validates citations", () => {
    expect(
      isCitation({
        document_id: "didi-build/foo",
        chunk_index: 0,
        knowledge_source_id: "ks",
        excerpt: "line",
      }),
    ).toBe(true);
    expect(isCitation({ document_id: "x" })).toBe(false);
  });
});

describe("history mapping", () => {
  it("maps assistant direct answers and stubs for reload", () => {
    const direct = threadItemsFromHistoryMessage({
      id: "m1",
      session_id: "s1",
      role: "assistant",
      content: "Answer",
      classified_intent: "simple_retrieval",
      response_kind: "direct_answer",
      citations: FIXTURE_DIRECT_RESPONSE.citations,
      council_decision: null,
      write_back_proposal: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(direct[0]?.kind).toBe("direct");

    const stub = threadItemsFromHistoryMessage({
      id: "m2",
      session_id: "s1",
      role: "assistant",
      content: "Linear read request identified, not yet implemented.",
      classified_intent: "linear_read",
      response_kind: "stub_not_implemented",
      citations: [],
      council_decision: null,
      write_back_proposal: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(stub[0]?.kind).toBe("stub");
    expect(historyToThreadItems([])).toEqual([]);
  });

  it("maps live responses to thread items", () => {
    expect(threadItemFromResponse(FIXTURE_DIRECT_RESPONSE).kind).toBe("direct");
    expect(threadItemFromResponse(FIXTURE_STUB_RESPONSE).kind).toBe("stub");
  });
});

describe("labels", () => {
  it("maps response kinds to route labels", () => {
    expect(responseKindRouteLabel("direct_answer")).toBe("Direct answer");
    expect(responseKindRouteLabel("stub_not_implemented")).toBe("Linear request");
    expect(responseKindRouteLabel("council_result")).toBe("Council review");
  });
});
