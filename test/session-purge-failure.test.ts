import { describe, expect, it } from "vitest";
import { purgeExpiredSessions } from "../src/jobs/session-purge.js";

describe("purgeExpiredSessions batch failure (unit)", () => {
  it("logs session_purge_failed with counts only and rethrows", async () => {
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ c: 0 }),
          run: async () => {
            throw new Error("D1 batch failed");
          },
        }),
      }),
    };

    const payloads: Record<string, string | number | boolean>[] = [];
    await expect(
      purgeExpiredSessions(failingDb as unknown as D1Database, {
        log: (payload) => payloads.push(payload),
      }),
    ).rejects.toThrow("D1 batch failed");

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      event: "session_purge_failed",
      total_deleted: 0,
      batches: 0,
    });
    expect(JSON.stringify(payloads[0])).not.toMatch(/D1/);
  });
});
