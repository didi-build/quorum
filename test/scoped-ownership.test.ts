import { describe, expect, it } from "vitest";
import { userIdForScopedRow } from "../src/domain/scoped-ownership.js";

describe("userIdForScopedRow (unit)", () => {
  it("returns the actor user id for scoped row writes", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(userIdForScopedRow(id)).toBe(id);
  });

  it("rejects null or empty actor user id", () => {
    expect(() => userIdForScopedRow(null)).toThrow(/actor user id is required/);
    expect(() => userIdForScopedRow("")).toThrow(/actor user id is required/);
  });
});
