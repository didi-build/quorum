import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MOCK_PREVIEW_HEADERS,
  MOCK_PREVIEW_REDIRECTS,
} from "../scripts/lib/mock-preview-static.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const wranglerStateDir = path.join(root, ".wrangler", "state");

type WranglerStateSnapshot = {
  exists: boolean;
  files: Record<string, { mtimeMs: number; sha256: string }>;
};

function snapshotWranglerState(dir: string): WranglerStateSnapshot {
  if (!fs.existsSync(dir)) {
    return { exists: false, files: {} };
  }
  const files: WranglerStateSnapshot["files"] = {};
  const walk = (relativeDir: string): void => {
    const absoluteDir = relativeDir ? path.join(dir, relativeDir) : dir;
    for (const name of fs.readdirSync(absoluteDir)) {
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const absolutePath = path.join(dir, relativePath);
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        walk(relativePath);
        continue;
      }
      const contents = fs.readFileSync(absolutePath);
      files[relativePath] = {
        mtimeMs: stat.mtimeMs,
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
      };
    }
  };
  walk("");
  return { exists: true, files };
}

function expectWranglerStateUnchanged(
  before: WranglerStateSnapshot,
  after: WranglerStateSnapshot,
): void {
  expect(after.exists).toBe(before.exists);
  expect(after.files).toEqual(before.files);
}

function runMockPreviewBuild(distDir: string): void {
  execSync("node scripts/sync-public-fonts.mjs", { cwd: root, stdio: "pipe" });
  execSync("npx vite build --config frontend/vite.config.ts --mode mock-preview", {
    cwd: root,
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      QUORUM_FRONTEND_PREVIEW_OUT_DIR: distDir,
    },
  });
  execSync("node scripts/finish-frontend-dist.mjs", {
    cwd: root,
    stdio: "pipe",
    env: {
      ...process.env,
      FRONTEND_DIST: distDir,
      QUORUM_FRONTEND_DIST_PROFILE: "mock-preview",
    },
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (response.status > 0) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`server did not become ready at ${url}`);
}

function spawnWranglerDev(
  previewDist: string,
  port: number,
  persistTo: string,
): ChildProcess {
  return spawn(
    process.execPath,
    [
      wranglerBin,
      "dev",
      "--config",
      "wrangler.preview.jsonc",
      "--assets",
      previewDist,
      "--persist-to",
      persistTo,
      "--port",
      String(port),
    ],
    {
      cwd: root,
      stdio: "pipe",
      env: process.env,
      detached: process.platform !== "win32",
    },
  );
}

function killTree(child: ChildProcess, force = false): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // already exited
    }
    return;
  }
  try {
    process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    // already exited
  }
}

type StopWranglerDevResult = {
  elapsedMs: number;
  forced: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
};

async function stopWranglerDev(child: ChildProcess): Promise<StopWranglerDevResult> {
  const started = Date.now();
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      elapsedMs: Date.now() - started,
      forced: false,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
    };
  }
  if (!child.pid) {
    return {
      elapsedMs: Date.now() - started,
      forced: false,
      exitCode: null,
      signalCode: null,
    };
  }
  let forced = false;
  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      forced = true;
      killTree(child, true);
      resolve();
    }, 10_000);
    child.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });
    killTree(child);
  });
  return {
    elapsedMs: Date.now() - started,
    forced,
    exitCode: child.exitCode,
    signalCode: child.signalCode,
  };
}

function assertGracefulWranglerStop(result: StopWranglerDevResult): void {
  expect(result.forced).toBe(false);
  const exited = result.exitCode !== null || result.signalCode !== null;
  expect(exited).toBe(true);
  expect(result.elapsedMs < 10_000 || result.signalCode === "SIGTERM").toBe(true);
}

describe("stopWranglerDev teardown", () => {
  it("returns immediately when the child already exited", async () => {
    const child = {
      exitCode: 0,
      signalCode: null,
      pid: 42_424,
    } as ChildProcess;
    const result = await stopWranglerDev(child);
    expect(result.elapsedMs).toBeLessThan(500);
    expect(result.exitCode).toBe(0);
    expect(result.signalCode).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("returns immediately when the child already has a signal", async () => {
    const child = {
      exitCode: null,
      signalCode: "SIGKILL",
      pid: 42_425,
    } as ChildProcess;
    const result = await stopWranglerDev(child);
    expect(result.elapsedMs).toBeLessThan(500);
    expect(result.signalCode).toBe("SIGKILL");
    expect(result.forced).toBe(false);
  });
});

describe("mock-preview dist-preview static layout", () => {
  it(
    "omits root landing, emits _redirects and _headers, and serves them via wrangler dev",
    { timeout: 120_000 },
    async () => {
      const wranglerStateBefore = snapshotWranglerState(wranglerStateDir);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-preview-static-"));
      const previewDist = path.join(tmp, "dist-preview");
      fs.mkdirSync(previewDist, { recursive: true });

      runMockPreviewBuild(previewDist);

      expect(fs.existsSync(path.join(previewDist, "index.html"))).toBe(false);
      expect(fs.existsSync(path.join(previewDist, "style.css"))).toBe(false);
      expect(fs.readFileSync(path.join(previewDist, "_redirects"), "utf8")).toBe(
        MOCK_PREVIEW_REDIRECTS,
      );
      expect(fs.readFileSync(path.join(previewDist, "_headers"), "utf8")).toBe(
        MOCK_PREVIEW_HEADERS,
      );
      expect(fs.existsSync(path.join(previewDist, "app", "index.html"))).toBe(true);

      const wranglerPersist = path.join(tmp, "wrangler-persist");
      const port = 19_000 + Math.floor(Math.random() * 1000);
      const wrangler = spawnWranglerDev(previewDist, port, wranglerPersist);

      try {
        await waitForServer(`http://127.0.0.1:${port}/`);
        expect(fs.existsSync(wranglerPersist)).toBe(true);

        const rootResponse = await fetch(`http://127.0.0.1:${port}/`, {
          redirect: "manual",
        });
        expect(rootResponse.status).toBe(302);
        expect(rootResponse.headers.get("Location")).toMatch(/\/app\/$/);
        expect(rootResponse.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

        const appResponse = await fetch(`http://127.0.0.1:${port}/app/`, {
          redirect: "manual",
        });
        expect(appResponse.status).toBe(200);
        expect(appResponse.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      } finally {
        const stopResult = await stopWranglerDev(wrangler);
        assertGracefulWranglerStop(stopResult);
        expectWranglerStateUnchanged(
          wranglerStateBefore,
          snapshotWranglerState(wranglerStateDir),
        );
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});
