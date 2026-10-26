import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expectedPreviewScreenshotCount } from "../scripts/lib/preview-screenshot-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("verify-preview-screenshot-count", () => {
  it("accepts the planned number of PNG files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-shot-count-"));
    for (let index = 0; index < expectedPreviewScreenshotCount(); index += 1) {
      fs.writeFileSync(path.join(tmp, `shot-${index}.png`), "x");
    }
    const stdout = execFileSync(
      "node",
      ["scripts/verify-preview-screenshot-count.mjs"],
      {
        cwd: root,
        env: { ...process.env, PREVIEW_SCREENSHOTS_DIR: tmp },
        encoding: "utf8",
      },
    );
    expect(stdout).toContain("verify-preview-screenshot-count: ok");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("fails when the PNG count is wrong", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-shot-count-"));
    fs.writeFileSync(path.join(tmp, "only-one.png"), "x");
    expect(() => {
      execFileSync("node", ["scripts/verify-preview-screenshot-count.mjs"], {
        cwd: root,
        env: { ...process.env, PREVIEW_SCREENSHOTS_DIR: tmp },
        stdio: "pipe",
      });
    }).toThrow();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
