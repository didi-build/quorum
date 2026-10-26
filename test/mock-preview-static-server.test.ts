import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MOCK_PREVIEW_HEADERS,
  MOCK_PREVIEW_REDIRECTS,
} from "../scripts/lib/mock-preview-static.mjs";
import {
  handleLandingStaticRequest,
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

  it("honours _redirects and _headers for dist-preview layout", async () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-mock-preview-"));
    tempDirs.push(distRoot);
    fs.mkdirSync(path.join(distRoot, "app"), { recursive: true });
    fs.writeFileSync(
      path.join(distRoot, "app", "index.html"),
      "<!doctype html><html><head><title>spa</title></head><body>spa</body></html>",
    );
    fs.writeFileSync(path.join(distRoot, "_redirects"), MOCK_PREVIEW_REDIRECTS);
    fs.writeFileSync(path.join(distRoot, "_headers"), MOCK_PREVIEW_HEADERS);

    const started = await startMockPreviewStaticServer({ distRoot, port: 0 });
    server = started;

    const rootResponse = await fetch(`${started.baseUrl}/`, { redirect: "manual" });
    expect(rootResponse.status).toBe(302);
    expect(rootResponse.headers.get("location")).toBe(`${started.baseUrl}/app/`);
    expect(rootResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const metaResponse = await fetch(`${started.baseUrl}/_redirects`);
    expect(metaResponse.status).toBe(404);
    expect(metaResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const appResponse = await fetch(`${started.baseUrl}/app/`);
    expect(appResponse.status).toBe(200);
    expect(appResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
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

  it("stubs /health for repo landing pages", () => {
    const landingRoot = path.join(process.cwd(), "landing");
    const request = {
      method: "GET",
      url: "/health",
      headers: { host: "127.0.0.1:4173" },
    } as import("node:http").IncomingMessage;
    const response = handleLandingStaticRequest(request, landingRoot);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.toString())).toEqual({ status: "ok" });
  });
});
