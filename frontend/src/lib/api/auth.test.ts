import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_FETCH_TIMEOUT_MS, authFetch } from "./auth-http";
import { authFixtures, createAuthApi, fetchAuthUser, resetAuthApiCache } from "./auth";

describe("fetchAuthUser preview gate (unit)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetAuthApiCache();
    vi.restoreAllMocks();
  });

  it("returns preview-user when MODE is mock-preview", async () => {
    vi.stubEnv("MODE", "mock-preview");
    await expect(fetchAuthUser()).resolves.toEqual({
      login: "preview-user",
      github_id: 9001,
    });
  });

  it("returns null in mock-preview when quorum_preview_screen=sign-in", async () => {
    vi.stubEnv("MODE", "mock-preview");
    vi.stubGlobal("location", {
      ...window.location,
      search: "?quorum_preview_screen=sign-in",
    });
    await expect(fetchAuthUser()).resolves.toBeNull();
  });
});

describe("auth API client (unit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetchAuthUser returns null on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("fetchAuthUser returns user JSON on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => authFixtures.user,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).resolves.toEqual(authFixtures.user);
  });

  it("fetchAuthUser throws on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("fetchAuthUser throws on HTML 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => "text/html" },
        json: async () => {
          throw new Error("invalid json");
        },
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("fetchAuthUser throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("fetchAccessDeniedInfo returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAccessDeniedInfo()).resolves.toBeNull();
  });

  it("fetchAccessDeniedInfo throws on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAccessDeniedInfo()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("fetchAccessDeniedInfo throws on HTML 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => "text/html" },
        json: async () => ({}),
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAccessDeniedInfo()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("fetchAccessDeniedInfo throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = createAuthApi();
    await expect(api.fetchAccessDeniedInfo()).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("logout posts to /auth/logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 204,
        ok: true,
      }),
    );
    const api = createAuthApi();
    await api.logout();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});

describe("authFetch timeout (unit)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rejects when the request does not finish before the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const promise = authFetch("/auth/me", {}, 1000);
    const assertion = expect(promise).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(AUTH_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
