import { describe, expect, it } from "vitest";
import {
  sessionPurgeCutoffIso,
  sessionTimestampIsoSqlMatch,
  toIso8601Utc,
} from "../src/jobs/session-purge.js";

describe("sessionTimestampIsoSqlMatch (unit)", () => {
  it("uses digit-class GLOB segments and fixed ISO 8601 UTC literals", () => {
    const sql = sessionTimestampIsoSqlMatch("expires_at");
    expect(sql).not.toContain("?");
    expect(sql).toContain("GLOB '[0-9][0-9][0-9][0-9]'");
    expect(sql).toContain("substr(expires_at, 5, 1) = '-'");
    expect(sql).toContain("length(expires_at) = 24");
  });
});

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
