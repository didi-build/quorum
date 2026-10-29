#!/usr/bin/env node
import { resolveViteBin } from "./lib/resolve-vite-bin.mjs";
import { runStepOrExit } from "./lib/run-step.mjs";

const viteBin = resolveViteBin();

runStepOrExit(
  "clean-gallery-dist",
  process.execPath,
  ["scripts/clean-gallery-dist.mjs"],
  {
    cwd: process.cwd(),
  },
);

runStepOrExit(
  "vite gallery build",
  process.execPath,
  [viteBin, "build", "--config", "frontend/vite.gallery.config.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production" },
  },
);
