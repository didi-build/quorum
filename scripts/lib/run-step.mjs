import { spawnSync } from "node:child_process";

/**
 * Run a child process; inherit stdio and exit the parent on failure.
 *
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string; env?: NodeJS.ProcessEnv }} [options]
 */
export function runStepOrExit(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: options.env ?? process.env,
  });

  if (result.error) {
    console.error(`run-step: ${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`run-step: ${label} exited with code ${code}`);
    process.exit(code);
  }
}
