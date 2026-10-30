import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Text based guard for route files only. Known limits: the walk scans *.ts under
// routesDir only (.mts route files are not scanned). A route that imports a domain
// module which re exports purge under a new name is not caught, because the route
// file may contain neither purgeKnowledgeSource nor knowledge-sources/delete.js.

const DELETE_MODULE_PATH_RE = /knowledge-sources\/delete\.js/;
const PURGE_SYMBOL_RE = /purgeKnowledgeSource/;
const ALLOWED_DELETE_IMPORT_LINE_RE =
  /^\s*import\s*\{\s*deleteKnowledgeSource\s*\}\s*from\s*['"][^'"]*knowledge-sources\/delete\.js['"];?\s*$/m;

/**
 * @param {string} content
 * @returns {string[]}
 */
export function collectRoutePurgeImportViolations(content: string): string[] {
  const errors: string[] = [];
  if (PURGE_SYMBOL_RE.test(content)) {
    errors.push("must not reference purgeKnowledgeSource");
  }
  if (DELETE_MODULE_PATH_RE.test(content)) {
    const withoutAllowed = content.replace(ALLOWED_DELETE_IMPORT_LINE_RE, "");
    if (DELETE_MODULE_PATH_RE.test(withoutAllowed)) {
      errors.push(
        "must not import knowledge-sources/delete.js except deleteKnowledgeSource",
      );
    }
  }
  return errors;
}

/**
 * @param {string} routesDir
 * @returns {string[]}
 */
export function collectRoutesDirPurgeImportViolations(routesDir: string): string[] {
  const errors: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts")) {
        continue;
      }
      const rel = relative(routesDir, full).replace(/\\/g, "/");
      const content = readFileSync(full, "utf8");
      for (const message of collectRoutePurgeImportViolations(content)) {
        errors.push(`${rel}: ${message}`);
      }
    }
  }

  walk(routesDir);
  return errors;
}

describe("collectRoutePurgeImportViolations (unit)", () => {
  it("allows deleteKnowledgeSource import from delete.js", () => {
    const content = `import { deleteKnowledgeSource } from "../domain/knowledge-sources/delete.js";\n`;
    expect(collectRoutePurgeImportViolations(content)).toEqual([]);
  });

  it("rejects purgeKnowledgeSource symbol", () => {
    const content = `import { purgeKnowledgeSource } from "../domain/knowledge-sources/delete.js";\n`;
    expect(
      collectRoutePurgeImportViolations(content).some((e) =>
        e.includes("purgeKnowledgeSource"),
      ),
    ).toBe(true);
  });

  it("rejects renamed re-export from delete.js without purgeKnowledgeSource in import line", () => {
    const content = `export { purgeKnowledgeSource as purgeOwnedSource } from "../domain/knowledge-sources/delete.js";\n`;
    expect(collectRoutePurgeImportViolations(content).length).toBeGreaterThan(0);
  });

  it("rejects namespace import from delete.js", () => {
    const content = `import * as knowledgeDelete from "../domain/knowledge-sources/delete.js";\n`;
    expect(
      collectRoutePurgeImportViolations(content).some((e) => e.includes("delete.js")),
    ).toBe(true);
  });
});

describe("purgeKnowledgeSource import guard", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is not imported from src/routes (recursive walk)", () => {
    const routesDir = join(process.cwd(), "src/routes");
    expect(collectRoutesDirPurgeImportViolations(routesDir)).toEqual([]);
  });

  it("fails when a nested route file imports purgeKnowledgeSource", () => {
    const root = mkdtempSync(join(tmpdir(), "quorum-purge-import-guard-"));
    tempRoots.push(root);
    const nestedDir = join(root, "src", "routes", "admin");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, "purge.ts"),
      `import { purgeKnowledgeSource } from "../../domain/knowledge-sources/delete.js";\n`,
    );
    expect(collectRoutesDirPurgeImportViolations(join(root, "src/routes"))).not.toEqual(
      [],
    );
  });

  it("would miss nested violations without recursive walk", () => {
    const root = mkdtempSync(join(tmpdir(), "quorum-purge-import-guard-"));
    tempRoots.push(root);
    const nestedDir = join(root, "src", "routes", "nested");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, "evil.ts"),
      `import { purgeKnowledgeSource } from "../../domain/knowledge-sources/delete.js";\n`,
    );
    const routesDir = join(root, "src/routes");
    const topLevelOnly: string[] = [];
    for (const file of readdirSync(routesDir)) {
      if (!file.endsWith(".ts")) {
        continue;
      }
      topLevelOnly.push(
        ...collectRoutePurgeImportViolations(
          readFileSync(join(routesDir, file), "utf8"),
        ),
      );
    }
    expect(topLevelOnly).toEqual([]);
    expect(collectRoutesDirPurgeImportViolations(routesDir).length).toBeGreaterThan(0);
  });
});
