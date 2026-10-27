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

  it("unwraps GET /connections { connections } into Connection[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              connections: [
                {
                  id: "conn-1",
                  user_id: "user-1",
                  provider: "github",
                  external_account_id: "99",
                  external_account_name: "didi-build",
                  created_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    const list = await api.listConnections();
    expect(list).toEqual([
      {
        id: "conn-1",
        provider: "github",
        connected: true,
        account_label: "didi-build",
      },
    ]);
  });

  it("rejects bare array for GET /connections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify([{ id: "conn-1", provider: "github" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    await expect(api.listConnections()).rejects.toBeInstanceOf(SourcesApiError);
  });

  it("unwraps available-sources { provider, items } into AvailableSourceItem[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              provider: "github",
              items: [
                {
                  source_type: "github_repo",
                  external_ref: "org/repo",
                  name: "org/repo",
                  private: true,
                  updated_at: null,
                  key: null,
                  already_added: false,
                  source_id: null,
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    const list = await api.listAvailableSources("conn-1", "github");
    expect(list).toEqual([
      {
        name: "org/repo",
        external_ref: "org/repo",
        private: true,
        key: "",
        already_added: false,
      },
    ]);
  });

  it("rejects bare array for available-sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([{ name: "org/repo", external_ref: "org/repo" }]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );
    const api = createHttpSourcesApi();
    await expect(api.listAvailableSources("conn-1", "github")).rejects.toBeInstanceOf(
      SourcesApiError,
    );
  });
});
