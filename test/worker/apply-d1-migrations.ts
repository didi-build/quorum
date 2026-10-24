import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, inject } from "vitest";

type D1Migration = {
  name: string;
  queries: string[];
};

beforeAll(async () => {
  const migrations = inject("testD1Migrations") as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
});
