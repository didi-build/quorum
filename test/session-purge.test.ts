import { describe, expect, it } from "vitest";
import { sessionPurgeCutoffIso, toIso8601Utc } from "../src/jobs/session-purge.js";

describe("sessionPurgeCutoffIso (unit)", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");

  it("returns ISO 8601 UTC thirty days before now", () => {
    expect(sessionPurgeCutoffIso(now, 30)).toBe("2026-09-26T12:00:00.000Z");
  });

  it("matches toIso8601Utc output format", () => {
    const cutoff = sessionPurgeCutoffIso(now);
    expect(cutoff).toBe(
      toIso8601Utc(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    );
  });
});
