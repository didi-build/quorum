import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = path.join(root, "scripts", "build-frontend.mjs");

describe("build-frontend.mjs", () => {
  it("exits non-zero when the mode argument is missing or invalid", () => {
    expect(() => {
      execSync(`node "${buildScript}"`, { cwd: root, stdio: "pipe" });
    }).toThrow();

    expect(() => {
      execSync(`node "${buildScript}" not-a-mode`, { cwd: root, stdio: "pipe" });
    }).toThrow();
  });
});

describe("run-step env (Windows-safe)", () => {
  it("passes FRONTEND_DIST via spawn env (not POSIX inline assignment)", () => {
    execSync(`node "${path.join(root, "test/fixtures/run-step-env-probe.mjs")}"`, {
      cwd: root,
      stdio: "pipe",
    });
  });

  it("exits non-zero when the child process fails", () => {
    expect(() => {
      execSync(`node "${path.join(root, "test/fixtures/run-step-fail-probe.mjs")}"`, {
        cwd: root,
        stdio: "pipe",
      });
    }).toThrow();
  });
});
