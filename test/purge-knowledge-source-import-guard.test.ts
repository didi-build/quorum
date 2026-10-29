import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("purgeKnowledgeSource import guard", () => {
  it("is not imported from src/routes", () => {
    const routesDir = join(process.cwd(), "src/routes");
    for (const file of readdirSync(routesDir)) {
      if (!file.endsWith(".ts")) {
        continue;
      }
      const content = readFileSync(join(routesDir, file), "utf8");
      expect(content, file).not.toMatch(/purgeKnowledgeSource/);
    }
  });
});
