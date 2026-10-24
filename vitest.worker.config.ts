import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { readD1Migrations } from "./scripts/read-d1-migrations.mjs";

type D1Migration = {
  name: string;
  queries: string[];
};

declare module "vitest" {
  export interface ProvidedContext {
    testD1Migrations: D1Migration[];
  }
}

export default defineWorkersConfig(async () => {
  const testD1Migrations = readD1Migrations("./migrations");
  return {
    test: {
      include: ["test/worker/**/*.test.ts"],
      reporters: process.env.CI ? ["default", "junit"] : ["default"],
      outputFile: process.env.CI
        ? { junit: "test-results/worker-junit.xml" }
        : undefined,
      provide: {
        testD1Migrations,
      },
      setupFiles: ["./test/worker/apply-d1-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
        },
      },
    },
  };
});
