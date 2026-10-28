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
    const mockDb = {
      prepare() {
        return {
          bind(...args: unknown[]) {
            bindCount = args.length;
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

    await getSessionMessages(mockDb, "session-a", actor, {
      limit: 100,
      cursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "mid" },
    });
    expect(bindCount).toBeLessThanOrEqual(100);
    expect(bindCount).toBe(6);
  });
});
