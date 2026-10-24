import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import { parsePrecacheRelativeUrls, precacheUrlToFetchPath } from "./precache-manifest";

function htmlRequest(path: string, method = "GET"): Request {
  return new Request(`http://example.com${path}`, {
    method,
    headers: { Accept: "text/html" },
  });
}

function assetRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://example.com${path}`, init);
}

describe("Worker static assets (integration, vitest-pool-workers)", () => {
  it("serves landing HTML at /", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(htmlRequest("/"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Three seats debate");
    expect(html).toContain("/app/");
  });

  it("serves the SPA shell at /app/connections and /app/not-allowed", async () => {
    for (const path of ["/app/connections", "/app/not-allowed"]) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(htmlRequest(path), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('id="root"');
      expect(html).not.toContain("Three seats debate");
    }
  });

  it("does not SPA-fallback non-HTML or non-/app/ paths", async () => {
    const missingChunk = "/app/assets/quorum-missing-chunk-qa.js";

    const starCtx = createExecutionContext();
    const starResponse = await worker.fetch(
      assetRequest(missingChunk, { headers: { Accept: "*/*" } }),
      env,
      starCtx,
    );
    await waitOnExecutionContext(starCtx);
    expect(starResponse.status).toBe(404);

    const noAcceptCtx = createExecutionContext();
    const noAcceptResponse = await worker.fetch(
      assetRequest(missingChunk),
      env,
      noAcceptCtx,
    );
    await waitOnExecutionContext(noAcceptCtx);
    expect(noAcceptResponse.status).toBe(404);

    const applicationCtx = createExecutionContext();
    const applicationResponse = await worker.fetch(
      htmlRequest("/application"),
      env,
      applicationCtx,
    );
    await waitOnExecutionContext(applicationCtx);
    const applicationHtml = await applicationResponse.text();
    expect(applicationHtml).not.toContain('id="root"');

    const postCtx = createExecutionContext();
    const postResponse = await worker.fetch(
      assetRequest("/app/connections", {
        method: "POST",
        headers: { Accept: "text/html" },
      }),
      env,
      postCtx,
    );
    await waitOnExecutionContext(postCtx);
    expect(postResponse.status).not.toBe(200);
    const postBody = await postResponse.text();
    expect(postBody).not.toContain('id="root"');
  });

  it("returns ok JSON for /health", async () => {
    const request = new Request("http://example.com/health");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns ready JSON for /ready when D1 is reachable", async () => {
    const request = new Request("http://example.com/ready");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });
});

describe("Service worker precache (built assets)", () => {
  it("maps every precache URL to a real file and not the SPA shell", async () => {
    const swCtx = createExecutionContext();
    const swResponse = await worker.fetch(
      assetRequest("/app/sw.js", { headers: { Accept: "*/*" } }),
      env,
      swCtx,
    );
    await waitOnExecutionContext(swCtx);
    expect(swResponse.status).toBe(200);
    const swSource = await swResponse.text();
    const relativeUrls = parsePrecacheRelativeUrls(swSource);
    expect(relativeUrls.length).toBeGreaterThan(0);

    for (const relative of relativeUrls) {
      const fetchPath = precacheUrlToFetchPath(relative);
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        assetRequest(fetchPath, { headers: { Accept: "*/*" } }),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      const body = await response.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);
      const text = new TextDecoder().decode(body.slice(0, 200));
      expect(text).not.toContain('id="root"');
    }
  });
});
