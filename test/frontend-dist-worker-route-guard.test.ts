import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertNoReservedWorkerPathShadowsInFrontendDist,
  findReservedWorkerPathShadows,
} from "../scripts/lib/frontend-dist-worker-route-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionDist = path.join(root, "frontend/dist");

describe("frontend dist worker route guard (unit)", () => {
  it("flags static files under reserved URL prefixes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-dist-guard-"));
    fs.mkdirSync(path.join(tmp, "api"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "api", "shadow.json"), "{}", "utf8");
    fs.mkdirSync(path.join(tmp, "chat"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "chat", "ws"), "upgrade", "utf8");

    expect(findReservedWorkerPathShadows(tmp).sort()).toEqual([
      "/api/shadow.json",
      "/chat/ws",
    ]);
    expect(() => assertNoReservedWorkerPathShadowsInFrontendDist(tmp)).toThrow(
      /shadow Worker routes/,
    );

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("passes when dist has no reserved-prefix shadows", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-dist-guard-"));
    fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "app", "index.html"), "<!doctype html>", "utf8");
    fs.writeFileSync(path.join(tmp, "index.html"), "<!doctype html>", "utf8");

    expect(findReservedWorkerPathShadows(tmp)).toEqual([]);
    assertNoReservedWorkerPathShadowsInFrontendDist(tmp);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("production frontend/dist has no files under /api, /council, or /chat", () => {
    if (!fs.existsSync(productionDist)) {
      return;
    }
    assertNoReservedWorkerPathShadowsInFrontendDist(productionDist);
  });
});
