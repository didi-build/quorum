import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  handleMockPreviewStaticRequest,
  startMockPreviewStaticServer,
} from "../scripts/lib/mock-preview-static-server.mjs";

describe("mock-preview static server (unit)", () => {
  /** @type {{ close(): Promise<void> } | null} */
  let server: { close(): Promise<void> } | null = null;
  const tempDirs: string[] = [];

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves landing HTML at / when index.html exists", () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-mock-preview-"));
    tempDirs.push(distRoot);
    fs.writeFileSync(
      path.join(distRoot, "index.html"),
      "<!doctype html><html><head><title>landing</title></head><body><h1>Landing</h1></body></html>",
    );
    const request = {
      method: "GET",
      url: "/",
      headers: { host: "127.0.0.1:4173", accept: "text/html" },
    } as import("node:http").IncomingMessage;
    const response = handleMockPreviewStaticRequest(request, distRoot);
    expect(response.status).toBe(200);
    expect(response.headers["Content-Type"]).toContain("text/html");
  });

  it("serves the SPA shell for unknown /app paths when dist exists", async () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-mock-preview-"));
    tempDirs.push(distRoot);
    fs.mkdirSync(path.join(distRoot, "app"), { recursive: true });
    fs.writeFileSync(
      path.join(distRoot, "app", "index.html"),
      "<!doctype html><html><head><title>spa</title></head><body>spa</body></html>",
    );

    const started = await startMockPreviewStaticServer({
      distRoot,
      port: 0,
    });
    server = started;
    const response = await fetch(`${started.baseUrl}/app/connections`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
