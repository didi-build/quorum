import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component gallery registry (unit)", () => {
  it("registers StatusChip from frontend/src/components", () => {
    const registry = readFileSync("frontend/gallery/registry.ts", "utf8");
    expect(registry).toContain("statusChipGallery");
    const entry = readFileSync("frontend/src/components/StatusChip.gallery.ts", "utf8");
    expect(entry).toContain("design/app/ui-polish/spec.md");
  });
});
