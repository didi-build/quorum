#!/usr/bin/env node
/**
 * Upload quorum-preview with a PR preview alias. Prints only the preview URL to stdout.
 */
import { spawnSync } from "node:child_process";

const token = process.env.QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW;
const accountId = process.env.QUORUM_CLOUDFLARE_ACCOUNT_ID;
const prNumber = process.env.PREVIEW_PR_NUMBER;

if (!token) {
  console.error(
    "::notice::Skipping preview deploy: QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW is not set",
  );
  process.exit(0);
}

if (!accountId) {
  console.error(
    "::notice::Skipping preview deploy: QUORUM_CLOUDFLARE_ACCOUNT_ID repository variable is not set",
  );
  process.exit(0);
}

if (!prNumber || !/^\d+$/.test(prNumber)) {
  console.error("::error::PREVIEW_PR_NUMBER must be a numeric pull request number");
  process.exit(1);
}

const alias = `pr-${prNumber}`;
const result = spawnSync(
  "npx",
  [
    "wrangler",
    "versions",
    "upload",
    "--config",
    "wrangler.preview.jsonc",
    "--preview-alias",
    alias,
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  },
);

if (result.error) {
  console.error(`::error::Failed to run wrangler: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("::error::wrangler versions upload failed (output withheld)");
  process.exit(result.status ?? 1);
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const urlMatch = combined.match(/https:\/\/[a-zA-Z0-9.-]*workers\.dev[^\s"'`)]*/);
const workerName = "quorum-preview";
const previewUrl = urlMatch?.[0] ?? `https://${alias}-${workerName}.workers.dev`;

process.stdout.write(`${previewUrl}\n`);
