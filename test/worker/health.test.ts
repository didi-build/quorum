import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";

function htmlRequest(path: string): Request {
  return new Request(`http://example.com${path}`, {
    headers: { Accept: "text/html" },
  });
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

  it("returns ok JSON for /health", async () => {
    const request = new Request("http://example.com/health");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
