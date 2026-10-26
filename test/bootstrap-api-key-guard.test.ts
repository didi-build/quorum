import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";
import {
  ensureBootstrapApiKey,
  resetBootstrapApiKeyGuard,
  validateApiKey,
} from "../src/domain/auth/api-key.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

function mockDbWithInsertCounter(): { db: D1Database; insertRuns: () => number } {
  let insertRuns = 0;
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        run: async () => {
          if (sql.includes("INSERT OR IGNORE INTO api_keys")) {
            insertRuns += 1;
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, insertRuns: () => insertRuns };
}

describe("ensureBootstrapApiKey per-isolate guard (unit)", () => {
  beforeEach(() => {
    resetBootstrapApiKeyGuard();
  });

  it("runs one bootstrap INSERT per isolate until reset", async () => {
    const { db, insertRuns } = mockDbWithInsertCounter();
    const config = loadConfig(withTestConfigEnv());

    await ensureBootstrapApiKey(db, config);
    await ensureBootstrapApiKey(db, config);
    expect(insertRuns()).toBe(1);

    resetBootstrapApiKeyGuard();
    await ensureBootstrapApiKey(db, config);
    expect(insertRuns()).toBe(2);
  });

  it("rejects the dev-vars bootstrap placeholder outside development even when a row exists", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ user_id: null, project_id: null }),
        }),
      }),
    } as unknown as D1Database;
    const config = loadConfig(withTestConfigEnv({ APP_ENV: "production" }));
    expect(await validateApiKey(db, config, "dev-api-key-change-me")).toBeNull();
  });
});
