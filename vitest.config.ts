import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const ciJunit = process.env.CI
  ? {
      reporters: ["default", "junit"],
      outputFile: { junit: "test-results/junit.xml" },
    }
  : { reporters: ["default"] };

export default defineConfig({
  test: {
    ...ciJunit,
    projects: [
      {
        test: {
          name: "launchpad",
          include: ["test/**/*.test.ts"],
          exclude: ["test/worker/**", "frontend/**"],
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
