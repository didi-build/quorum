import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadRouterEvalDataset } from "../src/domain/chat/eval.js";
import { readRouterEvalEnv } from "../scripts/eval-router.js";

describe("eval:router script (import-only, no live Anthropic)", () => {
  it("loads the ported dataset without filesystem access from src/domain/chat/eval", () => {
    expect(loadRouterEvalDataset()).toHaveLength(72);
  });

  it("readRouterEvalEnv requires only ANTHROPIC_API_KEY and SUPERVISOR_MODEL", () => {
    const priorKey = process.env.ANTHROPIC_API_KEY;
    const priorModel = process.env.SUPERVISOR_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SUPERVISOR_MODEL;
    try {
      expect(() => readRouterEvalEnv()).toThrow(/ANTHROPIC_API_KEY/);
      process.env.ANTHROPIC_API_KEY = "eval-test-key";
      expect(readRouterEvalEnv()).toEqual({
        anthropicApiKey: "eval-test-key",
        supervisorModel: "claude-haiku-4-5",
      });
      process.env.SUPERVISOR_MODEL = "custom-supervisor";
      expect(readRouterEvalEnv().supervisorModel).toBe("custom-supervisor");
    } finally {
      if (priorKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = priorKey;
      }
      if (priorModel === undefined) {
        delete process.env.SUPERVISOR_MODEL;
      } else {
        process.env.SUPERVISOR_MODEL = priorModel;
      }
    }
  });

  it("tsx can load the eval-router module graph without calling the API", async () => {
    const mod = await import("../scripts/eval-router.js");
    expect(typeof mod.runRouterEval).toBe("function");
  });

  it("exits before Anthropic when ANTHROPIC_API_KEY is missing", () => {
    const result = spawnSync("npx", ["tsx", "scripts/eval-router.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, ANTHROPIC_API_KEY: "" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toMatch(/ANTHROPIC_API_KEY/);
  });
});
