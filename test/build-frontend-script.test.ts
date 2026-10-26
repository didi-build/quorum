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

  it.skipIf(process.platform === "win32")(
    "reports the signal name when the child is killed",
    () => {
      let stderr = "";
      try {
        execSync(
          `node "${path.join(root, "test/fixtures/run-step-signal-probe.mjs")}"`,
          {
            cwd: root,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      } catch (error) {
        const err = error as { stderr?: string; stdout?: string };
        stderr = `${err.stderr ?? ""}${err.stdout ?? ""}`;
      }
      expect(stderr).toContain("killed by signal SIGTERM");
    },
  );
});
