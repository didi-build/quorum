import { afterEach, describe, expect, it, vi } from "vitest";
import { authFixtures, createAuthApi } from "./auth";

describe("auth API client (unit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(fetch).toHaveBeenCalledWith("/auth/me", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("fetchAuthUser returns user JSON on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => authFixtures.user,
      }),
    );
    const api = createAuthApi();
    await expect(api.fetchAuthUser()).resolves.toEqual(authFixtures.user);
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
    expect(fetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });
});
