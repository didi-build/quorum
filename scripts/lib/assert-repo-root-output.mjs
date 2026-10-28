import { basename, dirname, resolve } from "node:path";
import { WRANGLER_CI_CONFIG_BASENAME_RE } from "./wrangler-placeholders.mjs";

export const REPO_ROOT = resolve(process.cwd());

/**
 * Wrangler resolves main, assets.directory, migrations_dir, etc. relative to the
 * config file's directory; generated configs must sit in the repository root.
 */
export function assertOutputInRepoRoot(outputPath) {
  const resolved = resolve(outputPath);
  const parent = dirname(resolved);
  if (parent !== REPO_ROOT) {
    console.error(
      `Output must be a file directly in the repository root (got ${resolved}).\n` +
        "Wrangler resolves paths such as main, assets.directory, and migrations_dir relative to the config file directory, not the process cwd.",
    );
    process.exit(1);
  }
}

/**
 * Prepare script output must stay gitignored and must not overwrite wrangler.jsonc.
 * @param {string} outputPath
 * @param {string} sourcePath
 */
export function assertPrepareOutputPath(outputPath, sourcePath) {
  assertOutputInRepoRoot(outputPath);
  const resolvedOutput = resolve(outputPath);
  const resolvedSource = resolve(sourcePath);
  if (resolvedOutput === resolvedSource) {
    console.error(
      "Output must not overwrite the committed wrangler.jsonc source config.",
    );
    process.exit(1);
  }
  const base = basename(resolvedOutput);
  if (!WRANGLER_CI_CONFIG_BASENAME_RE.test(base)) {
    console.error(
      "Output basename must match wrangler*.ci.jsonc (gitignored deploy config).",
    );
    process.exit(1);
  }
}
