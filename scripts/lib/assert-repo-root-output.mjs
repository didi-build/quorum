import { dirname, resolve } from "node:path";

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
