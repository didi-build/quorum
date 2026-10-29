import { describe, expect, it, vi } from "vitest";
import worker from "../../preview/worker.js";
import {
  isAppSpaPath,
  isGallerySpaPath,
  shouldServeAppShell,
  shouldServeGalleryShell,
  wantsHtmlDocument,
} from "../../preview/spa-routing.js";

function mockAssets(handlers: Record<string, () => Response>): Fetcher {
  return {
    fetch: vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const handler = handlers[url.pathname];
      if (handler) {
        return handler();
      }
      return new Response(null, { status: 404 });
    }),
  } as unknown as Fetcher;
}

describe("preview spa-routing", () => {
  it("matches /app paths only", () => {
    expect(isAppSpaPath("/app")).toBe(true);
    expect(isAppSpaPath("/app/chat")).toBe(true);
    expect(isAppSpaPath("/")).toBe(false);
  });

  it("matches /gallery paths", () => {
    expect(isGallerySpaPath("/gallery")).toBe(true);
    expect(isGallerySpaPath("/gallery/")).toBe(true);
    expect(isGallerySpaPath("/gallery/status-chip")).toBe(true);
    expect(isGallerySpaPath("/app")).toBe(false);
  });

  it("requires text/html Accept for shell fallback", () => {
    const url = new URL("https://preview.example/app/missing");
    const asset404 = new Response(null, { status: 404 });
    expect(
      shouldServeAppShell(
        url,
        new Request(url, { headers: { Accept: "text/html" } }),
        asset404,
      ),
    ).toBe(true);
    expect(
      shouldServeGalleryShell(
        new URL("https://preview.example/gallery/missing"),
        new Request("https://preview.example/gallery/missing", {
          headers: { Accept: "text/html" },
        }),
        asset404,
      ),
    ).toBe(true);
    expect(
      shouldServeAppShell(
        url,
        new Request(url, { headers: { Accept: "*/*" } }),
        asset404,
      ),
    ).toBe(false);
  });

  it("detects HTML document requests", () => {
    expect(
      wantsHtmlDocument(
        new Request("https://x/app", { headers: { Accept: "text/html" } }),
      ),
    ).toBe(true);
    expect(
      wantsHtmlDocument(
        new Request("https://x/app", { headers: { Accept: "application/json" } }),
      ),
    ).toBe(false);
  });
});

describe("preview worker", () => {
  it("relies on static _redirects for / and does not redirect in the Worker", async () => {
    const env = { ASSETS: mockAssets({}) };
    const response = await worker.fetch(new Request("https://preview.example/"), env);
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("serves the gallery shell for missing /gallery/* HTML navigations", async () => {
    const env = {
      ASSETS: mockAssets({
        "/gallery/index.html": () =>
          new Response("<!doctype html><html id=gallery-root></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      }),
    };
    const response = await worker.fetch(
      new Request("https://preview.example/gallery/status-chip", {
        headers: { Accept: "text/html" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("id=gallery-root");
  });

  it("serves the SPA shell for missing /app/* HTML navigations", async () => {
    const env = {
      ASSETS: mockAssets({
        "/app/index.html": () =>
          new Response("<!doctype html><html id=root></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      }),
    };
    const response = await worker.fetch(
      new Request("https://preview.example/app/connections", {
        headers: { Accept: "text/html" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("id=root");
  });

  it("does not SPA-fallback non-HTML requests under /app/", async () => {
    const env = { ASSETS: mockAssets({}) };
    const response = await worker.fetch(
      new Request("https://preview.example/app/missing.json", {
        headers: { Accept: "application/json" },
      }),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("returns asset 404 for paths outside /app/ without shell fallback", async () => {
    const env = { ASSETS: mockAssets({}) };
    const response = await worker.fetch(
      new Request("https://preview.example/missing", {
        headers: { Accept: "text/html" },
      }),
      env,
    );
    expect(response.status).toBe(404);
  });
});
