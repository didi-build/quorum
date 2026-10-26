import type { Env } from "../../src/env.js";
import { testConfigEnv } from "../fixtures/config-env.js";

export function workerEnvWithSecrets(base: Env): Env {
  return { ...testConfigEnv, ...base };
}
