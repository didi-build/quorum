import { describe, expect, it } from "vitest";
import {
  clampHistoryLimit,
  decodeHistoryCursor,
  encodeHistoryCursor,
  getSessionMessages,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
} from "../src/domain/chat/service.js";
import { actorContext } from "../src/domain/schemas/actor.js";

describe("chat history pagination helpers (unit)", () => {
  it("clamps limit to default and max", () => {
    expect(clampHistoryLimit(undefined)).toBe(HISTORY_DEFAULT_LIMIT);
    expect(clampHistoryLimit(200)).toBe(HISTORY_MAX_LIMIT);
    expect(clampHistoryLimit(10)).toBe(10);
  });

  it("round-trips cursors on created_at and id", () => {
    const cursor = encodeHistoryCursor("2026-01-01T00:00:00.000Z", "msg-id");
    expect(decodeHistoryCursor(cursor)).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "msg-id",
    });
  });

  it("never binds more than 100 parameters on a history page query", async () => {
    let bindCount = 0;
    let limitBind: unknown;
    const mockDb = {
      prepare() {
        return {
          bind(...args: unknown[]) {
            bindCount = args.length;
            limitBind = args[args.length - 1];
            return {
              all: async () => ({ results: [] }),
            };
          },
        };
      },
    } as unknown as D1Database;

    const actor = actorContext("00000000-0000-4000-8000-000000000070");
    await getSessionMessages(mockDb, "session-a", actor, { limit: 100 });
    expect(bindCount).toBeLessThanOrEqual(100);
    expect(bindCount).toBe(3);
    expect(limitBind).toBe(101);

    await getSessionMessages(mockDb, "session-a", actor, {
      limit: 50,
      cursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "mid" },
    });
    expect(bindCount).toBeLessThanOrEqual(100);
    expect(bindCount).toBe(6);
    expect(limitBind).toBe(51);
  });

  it("orders rows with the same created_at by id ascending", async () => {
    const sharedCreatedAt = "2026-01-01T00:00:00.000Z";
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            return {
              all: async () => {
                expect(sql).toContain("ORDER BY m.created_at ASC, m.id ASC");
                return {
                  results: [
                    {
                      id: "00000000-0000-4000-8000-000000000001",
                      session_id: "s",
                      user_id: "00000000-0000-4000-8000-000000000070",
                      project_id: null,
                      role: "user",
                      content: "first",
                      classified_intent: null,
                      response_kind: null,
                      citations: "[]",
                      council_decision: null,
                      created_at: sharedCreatedAt,
                      wb_id: null,
                      wb_chat_message_id: null,
                      wb_user_id: null,
                      wb_project_id: null,
                      wb_plan: null,
                      wb_feedback_history: null,
                      wb_status: null,
                      wb_execution_results: null,
                      wb_created_at: null,
                      wb_updated_at: null,
                      wb_executed_at: null,
                    },
                    {
                      id: "00000000-0000-4000-8000-000000000002",
                      session_id: "s",
                      user_id: "00000000-0000-4000-8000-000000000070",
                      project_id: null,
                      role: "user",
                      content: "second",
                      classified_intent: null,
                      response_kind: null,
                      citations: "[]",
                      council_decision: null,
                      created_at: sharedCreatedAt,
                      wb_id: null,
                      wb_chat_message_id: null,
                      wb_user_id: null,
                      wb_project_id: null,
                      wb_plan: null,
                      wb_feedback_history: null,
                      wb_status: null,
                      wb_execution_results: null,
                      wb_created_at: null,
                      wb_updated_at: null,
                      wb_executed_at: null,
                    },
                  ],
                };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const actor = actorContext("00000000-0000-4000-8000-000000000070");
    const page = await getSessionMessages(mockDb, "s", actor, { limit: 10 });
    expect(page.messages.map((m) => m.content)).toEqual(["first", "second"]);
  });
});
