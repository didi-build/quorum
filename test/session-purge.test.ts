import { describe, expect, it } from "vitest";
import {
  SESSION_TIMESTAMP_ISO_GLOB,
  sessionPurgeCutoffIso,
  toIso8601Utc,
} from "../src/jobs/session-purge.js";

describe("SESSION_TIMESTAMP_ISO_GLOB (unit)", () => {
  it("uses digit classes so only well-formed UTC ISO timestamps match", () => {
    expect(SESSION_TIMESTAMP_ISO_GLOB).not.toContain("?");
    expect(SESSION_TIMESTAMP_ISO_GLOB).toMatch(/\[0-9\]/);
    expect("2026-10-26T12:00:00.000Z").toMatch(
      globToRegExp(SESSION_TIMESTAMP_ISO_GLOB),
    );
    expect("2020-01-01 00:00:00").not.toMatch(globToRegExp(SESSION_TIMESTAMP_ISO_GLOB));
  });
});

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const withClasses = escaped.replace(/\\\[0-9\\]/g, "[0-9]");
  return new RegExp(`^${withClasses}$`);
}

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
