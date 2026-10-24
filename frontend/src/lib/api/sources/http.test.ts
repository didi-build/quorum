import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcesApiError } from "./errors";
import { createHttpSourcesApi } from "./http";

describe("createHttpSourcesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends credentials on list requests", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpSourcesApi();
    await api.listSources();
    expect(fetchMock).toHaveBeenCalledWith(
      "/sources",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("maps error status to SourcesApiError with detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: "nope" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    await expect(api.listSources()).rejects.toMatchObject({
      status: 403,
      detail: "nope",
    });
  });

  it("treats empty 200 bodies as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 200 }))),
    );
    const api = createHttpSourcesApi();
    await expect(api.listSources()).rejects.toBeInstanceOf(SourcesApiError);
  });

  it("rejects wrapped list payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sources: [{ id: "x" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    await expect(api.listSources()).rejects.toBeInstanceOf(SourcesApiError);
  });

  it("handles non-JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("<html>404</html>", {
            status: 404,
            headers: { "Content-Type": "text/html" },
          }),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    await expect(api.listConnections()).rejects.toMatchObject({ status: 404 });
  });

  it("accepts 204 delete responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    const api = createHttpSourcesApi();
    await expect(api.deleteSource("src-1")).resolves.toBeUndefined();
  });

  it("accepts 200 delete responses with an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 200 }))),
    );
    const api = createHttpSourcesApi();
    await expect(api.deleteSource("src-1")).resolves.toBeUndefined();
  });
});
