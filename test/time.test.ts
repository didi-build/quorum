import { describe, expect, it } from "vitest";
import { isoFrom, isoNow } from "../src/lib/time.js";

describe("time helpers (unit)", () => {
  it("returns 3-digit millisecond UTC ISO strings", () => {
    const now = isoNow();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const from = isoFrom(new Date("2026-01-15T12:00:00.000Z"));
    expect(from).toBe("2026-01-15T12:00:00.000Z");
  });
});
