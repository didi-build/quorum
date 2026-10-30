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
import { SCANNED_FILE_RE } from "../scripts/lib/check-gallery-guards-lib.mjs";

// Text based guard for route files only. Known limit (G6, see CTO:-prefixed comment on
// Linear DIDI-975): a route that imports a domain module which re exports purge under a
// new name is not caught, because the route file may contain neither purgeKnowledgeSource
// nor knowledge-sources/delete.js. Scanned extensions are the gallery guard list
// (SCANNED_FILE_RE) plus .tsx, .jsx and .cts.

const DELETE_MODULE_PATH_RE = /knowledge-sources\/delete\.js/;
const PURGE_SYMBOL_RE = /purgeKnowledgeSource/;
const ALLOWED_DELETE_IMPORT_LINE_RE =
  /^\s*import\s*\{\s*deleteKnowledgeSource\s*\}\s*from\s*['"][^'"]*knowledge-sources\/delete\.js['"];?\s*$/m;

const ROUTE_GUARD_EXTRA_SCANNED_FILE_RE = /\.(tsx|jsx|cts)$/;

const GALLERY_GUARD_SCANNED_EXTENSIONS = [
  "yml",
  "yaml",
  "mjs",
  "js",
  "cjs",
  "ts",
  "mts",
  "sh",
] as const;

const ROUTE_GUARD_EXTRA_SCANNED_EXTENSIONS = ["tsx", "jsx", "cts"] as const;

const ROUTE_GUARD_SCANNED_EXTENSIONS = [
  ...GALLERY_GUARD_SCANNED_EXTENSIONS,
  ...ROUTE_GUARD_EXTRA_SCANNED_EXTENSIONS,
] as const;

/** @param {string} entry */
export function isRouteGuardScannedFile(entry: string): boolean {
  return SCANNED_FILE_RE.test(entry) || ROUTE_GUARD_EXTRA_SCANNED_FILE_RE.test(entry);
}

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
      if (!isRouteGuardScannedFile(entry)) {
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

  it("uses gallery guard extensions plus tsx, jsx and cts", () => {
    for (const ext of GALLERY_GUARD_SCANNED_EXTENSIONS) {
      expect(SCANNED_FILE_RE.test(`nested/evil.${ext}`)).toBe(true);
      expect(isRouteGuardScannedFile(`nested/evil.${ext}`)).toBe(true);
    }
    for (const ext of ROUTE_GUARD_EXTRA_SCANNED_EXTENSIONS) {
      expect(SCANNED_FILE_RE.test(`nested/evil.${ext}`)).toBe(false);
      expect(isRouteGuardScannedFile(`nested/evil.${ext}`)).toBe(true);
    }
  });

  it.each(ROUTE_GUARD_SCANNED_EXTENSIONS)(
    "flags nested route file with extension .%s and reports its relative path",
    (ext) => {
      const root = mkdtempSync(join(tmpdir(), "quorum-purge-import-guard-"));
      tempRoots.push(root);
      const nestedDir = join(root, "src", "routes", "nested");
      mkdirSync(nestedDir, { recursive: true });
      const fileName = `evil.${ext}`;
      writeFileSync(
        join(nestedDir, fileName),
        "export const bad = purgeKnowledgeSource;\n",
      );
      const routesDir = join(root, "src/routes");
      expect(collectRoutesDirPurgeImportViolations(routesDir)).toEqual([
        `nested/${fileName}: must not reference purgeKnowledgeSource`,
      ]);
    },
  );
});
