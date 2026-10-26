#!/usr/bin/env node
/**
 * Cross-platform frontend production / mock-preview build (sync fonts, Vite, finish dist).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildFrontendPlan } from "./lib/build-frontend-plan.mjs";
import { resolveViteBin } from "./lib/resolve-vite-bin.mjs";
import { runStepOrExit } from "./lib/run-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(root, "scripts");
const viteBin = resolveViteBin();

const mode = process.argv[2];
let plan;
try {
  plan = resolveBuildFrontendPlan(mode);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("Usage: node scripts/build-frontend.mjs <production|mock-preview>");
  process.exit(1);
}

const baseEnv = { ...process.env, NODE_ENV: "production" };

runStepOrExit(
  "sync-public-fonts",
  process.execPath,
  [path.join(scriptsDir, "sync-public-fonts.mjs")],
  { cwd: root },
);

runStepOrExit(
  "vite build",
  process.execPath,
  [viteBin, "build", "--config", "frontend/vite.config.ts", "--mode", plan.viteMode],
  { cwd: root, env: baseEnv },
);

runStepOrExit(
  "finish-frontend-dist",
  process.execPath,
  [path.join(scriptsDir, "finish-frontend-dist.mjs")],
  { cwd: root, env: { ...baseEnv, FRONTEND_DIST: plan.frontendDist } },
);
