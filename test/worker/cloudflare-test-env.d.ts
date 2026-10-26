import type { Env } from "../../src/env.js";

declare module "cloudflare:test" {
  // Augments the pool `env` binding; no extra fields beyond `Env`.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}

declare module "vitest" {
  export interface ProvidedContext {
    testD1Migrations: { name: string; queries: string[] }[];
  }
}
