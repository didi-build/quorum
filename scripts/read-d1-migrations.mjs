import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unstable_splitSqlQuery } from "wrangler";

/**
 * Reads D1 migration files for Vitest setup (same ordering as Wrangler).
 * @param {string} migrationsPath
 * @returns {{ name: string, queries: string[] }[]}
 */
export function readD1Migrations(migrationsPath) {
  const names = readdirSync(migrationsPath).filter((name) => name.endsWith(".sql"));
  names.sort((a, b) => {
    const aNumber = Number.parseInt(a.split("_")[0], 10);
    const bNumber = Number.parseInt(b.split("_")[0], 10);
    return aNumber - bNumber;
  });
  return names.map((name) => {
    const migrationPath = join(migrationsPath, name);
    const migration = readFileSync(migrationPath, "utf8");
    const queries = unstable_splitSqlQuery(migration);
    return { name, queries };
  });
}
