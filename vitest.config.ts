import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const junitReporter = process.env.CI
  ? {
      reporters: ["default", "junit"] as const,
      outputFile: { junit: "test-results/junit.xml" },
    }
  : { reporters: ["default"] as const };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "launchpad",
          include: ["test/**/*.test.ts"],
          exclude: ["test/worker/**", "frontend/**"],
          ...junitReporter,
        },
      },
      {
        root: "./frontend",
        base: "/app/",
        plugins: [react()],
        test: {
          name: "frontend",
          environment: "jsdom",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        },
      },
    ],
  },
});
