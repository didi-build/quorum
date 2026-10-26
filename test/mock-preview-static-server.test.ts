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

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("redirects / to /app/ like the preview Worker", () => {
    const request = {
      method: "GET",
      url: "/",
      headers: { host: "127.0.0.1:4173", accept: "text/html" },
    } as import("node:http").IncomingMessage;
    const response = handleMockPreviewStaticRequest(
      request,
      `${process.cwd()}/frontend/dist-preview`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.Location).toBe("http://127.0.0.1:4173/app/");
  });

  it("serves the SPA shell for unknown /app paths when dist exists", async () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-mock-preview-"));
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
