import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("vitest.config.ts JUnit reporter", () => {
  it("keeps unit JUnit on the root test block (not only inside a project)", () => {
    const source = readFileSync(path.join(root, "vitest.config.ts"), "utf8");
    const spreadIndex = source.indexOf("...ciJunit");
    const projectsIndex = source.indexOf("projects:");
    expect(spreadIndex).toBeGreaterThan(-1);
    expect(projectsIndex).toBeGreaterThan(spreadIndex);
    expect(source).toContain('outputFile: { junit: "test-results/junit.xml" }');
    expect(source).not.toContain("...junitReporter");
  });
});
