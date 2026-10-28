#!/usr/bin/env node
/**
 * Fail CI if a workflow passes D1 database ids through GitHub variables in step env.
 * Variables are echoed in Actions logs; secrets are masked.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOWS_DIR = resolve(
  process.env.QUORUM_WORKFLOW_POLICY_ROOT ?? ".github/workflows",
);

/** @type {RegExp} */
export const VARS_D1_DATABASE_ID_PATTERN =
  /vars\s*(?:\.\s*|\[\s*['"])QUORUM_D1_DATABASE_ID/i;

function fail(message) {
  console.error(`workflow D1 id masking failed: ${message}`);
  process.exit(1);
}

/**
 * @param {string} contents
 * @returns {RegExpMatchArray | null}
 */
export function findVarsD1DatabaseIdReference(contents) {
  return contents.match(VARS_D1_DATABASE_ID_PATTERN);
}

function listWorkflowFiles(dir) {
  return readdirSync(dir).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
  );
}

function main() {
  const files = listWorkflowFiles(WORKFLOWS_DIR);
  for (const file of files) {
    const path = resolve(WORKFLOWS_DIR, file);
    const contents = readFileSync(path, "utf8");
    const match = findVarsD1DatabaseIdReference(contents);
    if (match) {
      fail(
        `${file} must not pass D1 database ids via GitHub variables (found "${match[0]}"; use secrets.QUORUM_D1_DATABASE_ID instead)`,
      );
    }
  }
  console.log("workflow D1 id masking passed");
}

main();
