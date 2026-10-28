#!/usr/bin/env node
/**
 * Substitute the production D1 database_id placeholder and write a deploy-ready Wrangler config.
 *
 * Environment:
 *   QUORUM_D1_DATABASE_ID: production quorum-db id (GitHub Actions secret at deploy time)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertPrepareOutputPath } from "./lib/assert-repo-root-output.mjs";
import {
  D1_PLACEHOLDER_PRODUCTION,
  PRODUCTION_RESOURCE_MARKERS,
} from "./lib/wrangler-placeholders.mjs";

const SOURCE = resolve("wrangler.jsonc");

function usage() {
  console.error("Usage: prepare-wrangler-config.mjs --output <path>");
  process.exit(1);
}

function parseArgs(argv) {
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") output = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!output) usage();
  return { output: resolve(output) };
}

function resolveProductionD1Id() {
  const fromEnv = process.env.QUORUM_D1_DATABASE_ID?.trim();
  if (!fromEnv) {
    return { error: "missing QUORUM_D1_DATABASE_ID" };
  }
  if (fromEnv === D1_PLACEHOLDER_PRODUCTION) {
    return { error: "QUORUM_D1_DATABASE_ID must not be the committed placeholder" };
  }
  return { id: fromEnv };
}

function assertNoPlaceholderLeft(text, placeholder, label) {
  if (text.includes(placeholder)) {
    return `Failed to substitute ${label} D1 database_id.`;
  }
  return null;
}

function main() {
  const { output } = parseArgs(process.argv.slice(2));
  assertPrepareOutputPath(output, SOURCE);

  const resolved = resolveProductionD1Id();
  if (resolved.error) {
    console.error(resolved.error);
    process.exit(1);
  }

  const sourceText = readFileSync(SOURCE, "utf8");
  const text = sourceText.replaceAll(D1_PLACEHOLDER_PRODUCTION, resolved.id);
  const err = assertNoPlaceholderLeft(text, D1_PLACEHOLDER_PRODUCTION, "production");
  if (err) {
    console.error(err);
    process.exit(1);
  }

  writeFileSync(output, text, "utf8");
  console.log(
    `Prepared Wrangler config for production D1 binding ${PRODUCTION_RESOURCE_MARKERS.d1Binding} (${PRODUCTION_RESOURCE_MARKERS.d1Name}).`,
  );
}

main();
