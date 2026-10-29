import { describe, expect, it } from "vitest";
import { collectGalleryConfigViolations } from "../scripts/lib/check-gallery-guards-lib.mjs";
import { previewGalleryUrlFromAppEntry } from "../scripts/lib/gallery-assets-root.mjs";

describe("gallery config guards (unit)", () => {
  it("accepts quorum-preview gallery metadata config", () => {
    const errors = collectGalleryConfigViolations({
      name: "quorum-preview",
      workers_dev: true,
      assets: { directory: "./frontend/dist-preview" },
      previews: {},
    });
    expect(errors).toEqual([]);
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
