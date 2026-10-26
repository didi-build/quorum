import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function resolveVitePackageJson() {
  return require.resolve("vite/package.json");
}

/**
 * Resolve the Vite CLI entry from the installed package's package.json bin field.
 */
export function resolveViteBin() {
  const pkgPath = resolveVitePackageJson();
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const binField = pkg.bin;
  const binRel = typeof binField === "string" ? binField : binField?.vite;
  if (!binRel || typeof binRel !== "string") {
    throw new Error("resolve-vite-bin: vite package.json is missing a bin entry");
  }
  return path.join(path.dirname(pkgPath), binRel);
}
