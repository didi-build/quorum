import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveViteBin } from "../scripts/lib/resolve-vite-bin.mjs";

const resolveViteBinSource = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../scripts/lib/resolve-vite-bin.mjs",
  ),
  "utf8",
);

describe("resolveViteBin", () => {
  it("points at the vite package bin entry", () => {
    const bin = resolveViteBin();
    expect(bin).toMatch(/vite\.js$/);
    expect(existsSync(bin)).toBe(true);
  });

  it("resolves vite via createRequire only (Node 22.13 compatible)", () => {
    expect(resolveViteBinSource).not.toContain("findPackageJSON");
    expect(resolveViteBinSource).toContain('require.resolve("vite/package.json")');
  });
});
