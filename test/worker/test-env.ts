import { loadConfig } from "../../src/config/load-config.js";
import type { Env } from "../../src/env.js";
import { testConfigEnv } from "../fixtures/config-env.js";

/** Caller overrides win over default `testConfigEnv` (including `APP_ENV`). */
export function workerEnvWithSecrets(base: Env): Env {
  return { ...testConfigEnv, ...base };
}

export function effectiveAppEnv(bindings: Env): string {
  return loadConfig(bindings).appEnv;
}

export function workerEnvWithoutAppEnv(base: Env): Env {
  const merged = workerEnvWithSecrets(base);
  const copy = { ...merged };
  delete (copy as Record<string, unknown>).APP_ENV;
  return copy;
}
