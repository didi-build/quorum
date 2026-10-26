import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/index.js";
import {
  exchangeGithubUserCode,
  fetchGithubUser,
  GITHUB_HTTP_USER_AGENT,
} from "../src/domain/oauth/github-user.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("GitHub user OAuth HTTP (unit)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends User-Agent on token exchange and user fetch", async () => {
    const config = loadConfig(withTestConfigEnv());
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("access_token")) {
        expect(init?.headers).toMatchObject({ "User-Agent": GITHUB_HTTP_USER_AGENT });
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      if (url.includes("api.github.com/user")) {
        expect(init?.headers).toMatchObject({ "User-Agent": GITHUB_HTTP_USER_AGENT });
        return new Response(JSON.stringify({ id: 1, login: "octo" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await exchangeGithubUserCode(config, "code");
    await fetchGithubUser("tok");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
