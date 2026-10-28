#!/usr/bin/env node
/**
 * Deploy-time guards for production Wrangler configs.
 *
 * Usage:
 *   node scripts/check-deploy-guards.mjs --target committed --config wrangler.jsonc
 *   node scripts/check-deploy-guards.mjs --target production-deploy --config wrangler.ci.jsonc
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonc } from "./lib/parse-jsonc.mjs";
import {
  D1_PLACEHOLDER_PRODUCTION,
  PRODUCTION_RESOURCE_MARKERS,
} from "./lib/wrangler-placeholders.mjs";

function usage() {
  console.error(
    "Usage: check-deploy-guards.mjs --target <committed|production-deploy> --config <path>",
  );
  process.exit(1);
}

function parseArgs(argv) {
  let target = null;
  let configPath = resolve("wrangler.jsonc");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target") target = argv[++i];
    else if (arg === "--config") configPath = resolve(argv[++i]);
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!target) usage();
  return { target, configPath };
}

function fail(message) {
  console.error(`deploy-time guard failed: ${message}`);
  process.exit(1);
}

function loadConfig(configPath) {
  let text;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    fail("could not read wrangler config");
  }
  try {
    return parseJsonc(text);
  } catch {
    fail("wrangler config is not valid JSONC");
  }
}

function findProductionD1Row(config) {
  const rows = config.d1_databases ?? [];
  if (rows.length === 0) {
    fail("d1_databases is required");
  }
  const row = rows.find(
    (entry) => entry.binding === PRODUCTION_RESOURCE_MARKERS.d1Binding,
  );
  if (!row) {
    fail(
      `d1_databases must include binding "${PRODUCTION_RESOURCE_MARKERS.d1Binding}"`,
    );
  }
  return row;
}

function checkSharedProductionMarkers(config) {
  if (config.name !== PRODUCTION_RESOURCE_MARKERS.workerName) {
    fail(`Worker name must be "${PRODUCTION_RESOURCE_MARKERS.workerName}"`);
  }
  const row = findProductionD1Row(config);
  if (row.database_name !== PRODUCTION_RESOURCE_MARKERS.d1Name) {
    fail(`D1 database_name must be "${PRODUCTION_RESOURCE_MARKERS.d1Name}"`);
  }
  const producers = config.queues?.producers ?? [];
  const hasIndexingQueue = producers.some(
    (entry) => entry.queue === PRODUCTION_RESOURCE_MARKERS.queueName,
  );
  if (!hasIndexingQueue) {
    fail(
      `queues.producers must include queue "${PRODUCTION_RESOURCE_MARKERS.queueName}"`,
    );
  }
  const vectorize = config.vectorize ?? [];
  const hasEmbeddings = vectorize.some(
    (entry) => entry.index_name === PRODUCTION_RESOURCE_MARKERS.vectorizeIndex,
  );
  if (!hasEmbeddings) {
    fail(
      `vectorize must include index "${PRODUCTION_RESOURCE_MARKERS.vectorizeIndex}"`,
    );
  }
  return row;
}

function checkCommitted(config) {
  const row = checkSharedProductionMarkers(config);
  if (row.database_id !== D1_PLACEHOLDER_PRODUCTION) {
    fail(
      "committed wrangler.jsonc must keep the production D1 placeholder database_id",
    );
  }
  console.log("deploy-time guards passed (committed)");
}

function checkProductionDeploy(config) {
  const row = checkSharedProductionMarkers(config);
  const id = row.database_id;
  if (typeof id !== "string" || !id.trim()) {
    fail("production D1 database_id is required");
  }
  if (id === D1_PLACEHOLDER_PRODUCTION) {
    fail("production deploy must not use the placeholder D1 database_id");
  }
  console.log("deploy-time guards passed (production-deploy)");
}

function main() {
  const { target, configPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  if (target === "committed") {
    checkCommitted(config);
    return;
  }
  if (target === "production-deploy") {
    checkProductionDeploy(config);
    return;
  }
  console.error(`Unknown --target: ${target}`);
  usage();
}

main();
