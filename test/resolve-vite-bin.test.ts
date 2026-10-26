import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveViteBin } from "../scripts/lib/resolve-vite-bin.mjs";

describe("resolveViteBin", () => {
  it("points at the vite package bin entry", () => {
    const bin = resolveViteBin();
    expect(bin).toMatch(/vite\.js$/);
    expect(existsSync(bin)).toBe(true);
  });
});
