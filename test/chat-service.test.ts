import { describe, expect, it } from "vitest";
import {
  parseChatMessageIn,
  ChatInboundParseError,
} from "../src/domain/chat/parse-inbound.js";
import { processMessage, getSessionMessages } from "../src/domain/chat/service.js";
import { loadConfig } from "../src/config/load-config.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import { testConfigEnv } from "./fixtures/config-env.js";

describe("processMessage (unit, mocked router)", () => {
  const config = loadConfig(testConfigEnv);
  const actor = actorContext("00000000-0000-4000-8000-000000000060");
  const sessionId = "00000000-0000-4000-8000-000000000061";

  it("persists user and assistant rows through D1 bind calls", async () => {
    const runs: unknown[][] = [];
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            runs.push(args);
            return {
              async run() {
                return { success: true };
              },
              async first<T>() {
                if (sql.includes("WHERE id = ?")) {
                  return {
                    id: args[0],
                    session_id: sessionId,
                    user_id: actor.userId,
                    project_id: null,
                    role: runs.length === 1 ? "user" : "assistant",
                    content: runs.length === 1 ? "Hi" : "Hello back",
                    classified_intent: "greeting",
                    response_kind: runs.length === 1 ? null : "direct_answer",
                    citations: "[]",
                    council_decision: null,
                    created_at: "2026-01-01T00:00:00.000Z",
                  } as T;
                }
                return null;
              },
              all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const response = await processMessage({
      db: mockDb,
      vectorize: {} as VectorizeIndex,
      config,
      sessionId,
      content: "Hi",
      actor,
      intent: "greeting",
      routeMessageFn: async () => ({
        session_id: sessionId,
        content: "Hello back",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      }),
    });

    expect(response.classified_intent).toBe("greeting");
    expect(response.content).toBe("Hello back");
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid inbound payloads", () => {
    expect(() => parseChatMessageIn("{")).toThrow(ChatInboundParseError);
    expect(() =>
      parseChatMessageIn(JSON.stringify({ session_id: "s", content: "" })),
    ).toThrow(ChatInboundParseError);
  });

  it("aborts before assistant persistence when the signal fires during route", async () => {
    let insertCount = 0;
    const mockDb = {
      prepare(_sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                insertCount += 1;
                return { success: true };
              },
              async first<T>() {
                return {
                  id: args[0],
                  session_id: sessionId,
                  user_id: actor.userId,
                  project_id: null,
                  role: insertCount === 1 ? "user" : "assistant",
                  content: insertCount === 1 ? "Hi" : "Hello back",
                  classified_intent: "greeting",
                  response_kind: insertCount === 1 ? null : "direct_answer",
                  citations: "[]",
                  council_decision: null,
                  created_at: "2026-01-01T00:00:00.000Z",
                } as T;
              },
              all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const hangRoute = () =>
      new Promise<never>(() => {
        /* hang until abort */
      });

    const abortController = new AbortController();
    const pending = processMessage({
      db: mockDb,
      vectorize: {} as VectorizeIndex,
      config,
      sessionId,
      content: "Hi",
      actor,
      intent: "greeting",
      signal: abortController.signal,
      routeMessageFn: hangRoute,
    });

    await Promise.resolve();
    expect(insertCount).toBe(1);
    abortController.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(insertCount).toBe(1);
  });

  it("loads write-back proposals on history reads", async () => {
    const messageId = "00000000-0000-4000-8000-000000000062";
    const proposalId = "00000000-0000-4000-8000-000000000063";
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            return {
              async run() {
                return { success: true };
              },
              async first<T>() {
                return null as T;
              },
              all<T>() {
                if (sql.includes("FROM chat_messages m")) {
                  return {
                    results: [
                      {
                        id: messageId,
                        session_id: sessionId,
                        user_id: actor.userId,
                        project_id: null,
                        role: "assistant",
                        content: "Done",
                        classified_intent: "greeting",
                        response_kind: "direct_answer",
                        citations: "[]",
                        council_decision: null,
                        created_at: "2026-01-01T00:00:00.000Z",
                        wb_id: proposalId,
                        wb_chat_message_id: messageId,
                        wb_user_id: actor.userId,
                        wb_project_id: null,
                        wb_plan: JSON.stringify({
                          needs_doc_update: false,
                          doc_target: null,
                          existing_doc_path: null,
                          new_doc_slug: null,
                          needs_roadmap_item: false,
                        }),
                        wb_feedback_history: "[]",
                        wb_status: "proposed",
                        wb_execution_results: "[]",
                        wb_created_at: "2026-01-01T00:00:00.000Z",
                        wb_updated_at: "2026-01-01T00:00:00.000Z",
                        wb_executed_at: null,
                      },
                    ] as T[],
                  };
                }
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const page = await getSessionMessages(mockDb, sessionId, actor);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.write_back_proposal?.id).toBe(proposalId);
    expect(page.next_cursor).toBeNull();
  });
});
