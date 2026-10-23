import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["test/worker/**"],
    include: ["test/**/*.test.ts"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? { junit: "test-results/junit.xml" } : undefined,
  },
});
