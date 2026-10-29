import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectGalleryConfigViolations,
  runGalleryGuards,
} from "../scripts/lib/check-gallery-guards-lib.mjs";
import { previewGalleryUrlFromAppEntry } from "../scripts/lib/gallery-assets-root.mjs";

const VALID_CONFIG = {
  name: "quorum-preview",
  workers_dev: true,
  preview_urls: true,
  compatibility_date: "2025-10-11",
  assets: { directory: "./frontend/dist-preview" },
  previews: {},
};

const MIN_PREVIEW_WORKFLOW = `
jobs:
  build:
    steps:
      - run: npm run build:frontend:mock-preview
  gallery-probe:
    env:
      GALLERY_PROBE_MARKER: quorum-gallery-bundle-probe
`;

const MIN_GALLERY_WORKFLOW = `
jobs:
  gallery-guards:
    steps:
      - run: npm run gallery:guards
`;

function writeGalleryFixtureRoot(
  root: string,
  overrides: {
    config?: Record<string, unknown>;
    galleryWorkflow?: string;
    previewWorkflow?: string;
    evilScript?: string;
  } = {},
) {
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "preview"), { recursive: true });
  writeFileSync(
    join(root, "wrangler.gallery.jsonc"),
    JSON.stringify(overrides.config ?? VALID_CONFIG, null, 2),
  );
  writeFileSync(
    join(root, ".github/workflows/gallery-preview.yml"),
    overrides.galleryWorkflow ?? MIN_GALLERY_WORKFLOW,
  );
  writeFileSync(
    join(root, ".github/workflows/preview.yml"),
    overrides.previewWorkflow ?? MIN_PREVIEW_WORKFLOW,
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "gallery-guard-fixture", scripts: {} }, null, 2),
  );
  writeFileSync(join(root, "preview/worker.ts"), "export default {};\n");
  if (overrides.evilScript) {
    writeFileSync(join(root, "scripts/evil.mjs"), overrides.evilScript);
  }
}

describe("collectGalleryConfigViolations (unit)", () => {
  it("accepts quorum-preview gallery metadata config", () => {
    expect(collectGalleryConfigViolations(VALID_CONFIG)).toEqual([]);
  });

  it("rejects unknown top-level keys", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      main: "preview/worker.ts",
    });
    expect(errors.some((e) => e.includes("top-level key main"))).toBe(true);
  });

  it("rejects wrong Worker name", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      name: "other-preview",
    });
    expect(errors).toContain(
      'wrangler.gallery.jsonc name must remain "quorum-preview".',
    );
  });

  it("rejects workers_dev when not true", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      workers_dev: false,
    });
    expect(errors).toContain("wrangler.gallery.jsonc must set workers_dev to true.");
  });

  it("rejects missing assets block", () => {
    const { assets: _assets, ...rest } = VALID_CONFIG;
    const errors = collectGalleryConfigViolations(rest);
    expect(errors).toContain("wrangler.gallery.jsonc must define an assets block.");
  });

  it("rejects disallowed assets keys", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      assets: { directory: "./frontend/dist-preview", binding: "ASSETS" },
    });
    expect(errors.some((e) => e.includes("assets must not define binding"))).toBe(true);
  });

  it("rejects wrong assets directory", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      assets: { directory: "./dist/gallery" },
    });
    expect(errors).toContain(
      'wrangler.gallery.jsonc assets.directory must be "./frontend/dist-preview".',
    );
  });

  it("rejects missing previews block", () => {
    const { previews: _previews, ...rest } = VALID_CONFIG;
    const errors = collectGalleryConfigViolations(rest);
    expect(errors).toContain(
      "wrangler.gallery.jsonc must include an empty previews block.",
    );
  });

  it("rejects non-empty previews block", () => {
    const errors = collectGalleryConfigViolations({
      ...VALID_CONFIG,
      previews: { vars: { FOO: "bar" } },
    });
    expect(errors.some((e) => e.includes("previews must be empty"))).toBe(true);
  });
});

describe("runGalleryGuards (unit)", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes on the real repository layout", () => {
    expect(runGalleryGuards()).toEqual([]);
  });

  it("fails when gallery-preview.yml runs wrangler deploy", () => {
    const root = mkdtempSync(join(tmpdir(), "quorum-gallery-guards-"));
    tempRoots.push(root);
    writeGalleryFixtureRoot(root, {
      galleryWorkflow: `${MIN_GALLERY_WORKFLOW}\n      - run: npx wrangler deploy --config wrangler.gallery.jsonc`,
    });
    const errors = runGalleryGuards(root);
    expect(errors.some((e) => e.includes("must not run wrangler deploy"))).toBe(true);
  });

  it("fails when a script runs wrangler deploy with wrangler.gallery.jsonc", () => {
    const root = mkdtempSync(join(tmpdir(), "quorum-gallery-guards-"));
    tempRoots.push(root);
    writeGalleryFixtureRoot(root, {
      evilScript:
        'console.log("npx wrangler deploy --config wrangler.gallery.jsonc");\n',
    });
    const errors = runGalleryGuards(root);
    expect(
      errors.some((e) => e.includes("wrangler deploy with wrangler.gallery.jsonc")),
    ).toBe(true);
  });
});

describe("previewGalleryUrlFromAppEntry (unit)", () => {
  it("maps /app/ entry URL to /gallery/", () => {
    expect(
      previewGalleryUrlFromAppEntry(
        "https://pr-9-quorum-preview.example.workers.dev/app/",
      ),
    ).toBe("https://pr-9-quorum-preview.example.workers.dev/gallery/");
  });
});
