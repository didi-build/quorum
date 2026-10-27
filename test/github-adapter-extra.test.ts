import { describe, expect, it, vi } from "vitest";
import {
  encodeGithubRepoFullName,
  fetchGithubRepoDocuments,
} from "../src/domain/ingestion/adapters/github.js";
import { GITHUB_MAX_FILE_BYTES } from "../src/domain/ingestion/constants.js";
import { loadConfig } from "../src/config/load-config.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv());

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe("encodeGithubRepoFullName", () => {
  it("rejects malformed repository names", () => {
    expect(() => encodeGithubRepoFullName("not-a-repo")).toThrow(
      "Invalid GitHub repository full name",
    );
    expect(() => encodeGithubRepoFullName("owner/")).toThrow(
      "Invalid GitHub repository full name",
    );
    expect(() => encodeGithubRepoFullName("/repo")).toThrow(
      "Invalid GitHub repository full name",
    );
  });
});

describe("fetchGithubRepoDocuments extras", () => {
  it("encodes owner and repo in API paths", async () => {
    const repoFullName = "acme corp/quorum.app";
    const repoApiPath = encodeGithubRepoFullName(repoFullName);
    expect(repoApiPath).toBe("acme%20corp/quorum.app");

    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes(`/repos/${repoApiPath}`)) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      if (url.includes("/git/trees/")) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await fetchGithubRepoDocuments(config, "1", repoFullName, {
      fetchImpl,
      getInstallationAccessToken: async () => "token",
    });

    expect(urls.some((url) => url.includes(`/repos/${repoApiPath}`))).toBe(true);
  });

  it("falls back to HEAD when the default branch tree returns 404", async () => {
    const treeRefs: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/repos/owner/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      if (url.includes("/git/trees/")) {
        const ref = decodeURIComponent(
          url.split("/git/trees/")[1]?.split("?")[0] ?? "",
        );
        treeRefs.push(ref);
        if (ref === "main") {
          return new Response("missing", { status: 404 });
        }
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await fetchGithubRepoDocuments(config, "1", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "token",
    });

    expect(treeRefs).toContain("main");
    expect(treeRefs).toContain("HEAD");
  });

  it("skips tree blobs over the size cap without fetching blob content", async () => {
    const blobFetches: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/repos/owner/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      if (url.includes("/git/trees/")) {
        return new Response(
          JSON.stringify({
            tree: [
              {
                type: "blob",
                path: "oversized.md",
                sha: "big-sha",
                size: GITHUB_MAX_FILE_BYTES + 100,
              },
              {
                type: "blob",
                path: "src/node_modules/pkg/index.js",
                sha: "skip-sha",
                size: 10,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/git/blobs/")) {
        blobFetches.push(url);
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchGithubRepoDocuments(config, "1", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "token",
    });

    expect(result.documents).toHaveLength(0);
    expect(blobFetches).toHaveLength(0);
  });
});
