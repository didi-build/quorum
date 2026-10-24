import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";

describe("Worker /health (integration, vitest-pool-workers)", () => {
  it("serves landing HTML at /", async () => {
    const request = new Request("http://example.com/");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Three seats debate");
    expect(html).toContain("/app/");
  });

  it("returns ok JSON", async () => {
    const request = new Request("http://example.com/health");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
