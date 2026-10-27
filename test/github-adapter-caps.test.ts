import { describe, expect, it, vi } from "vitest";
import { fetchGithubRepoDocuments } from "../src/domain/ingestion/adapters/github.js";
import {
  GITHUB_MAX_FILE_BYTES,
  GITHUB_MAX_INDEX_FILES_PER_RUN,
} from "../src/domain/ingestion/constants.js";
import { loadConfig } from "../src/config/load-config.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv());

function makeTreeBlob(path: string, sha: string, size: number) {
  return { type: "blob", path, sha, size };
}

describe("fetchGithubRepoDocuments caps", () => {
  it("stops at the file count cap and reports continuation", async () => {
    const blobs = Array.from({ length: GITHUB_MAX_INDEX_FILES_PER_RUN + 40 }, (_, i) =>
      makeTreeBlob(`file-${i}.md`, `sha-${i}`, 10),
    );

    const requestUrl = (input: RequestInfo | URL): string => {
      if (typeof input === "string") {
        return input;
      }
      if (input instanceof URL) {
        return input.href;
      }
      return input.url;
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/git/trees/")) {
        return new Response(JSON.stringify({ tree: blobs }), { status: 200 });
      }
      if (url.includes("/git/blobs/")) {
        const content = btoa("hello");
        return new Response(JSON.stringify({ encoding: "base64", content }), {
          status: 200,
        });
      }
      if (url.endsWith("/repos/owner/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const tokenOptions = {
      fetchImpl,
      getInstallationAccessToken: async () => "token",
    };

    const first = await fetchGithubRepoDocuments(
      config,
      "12345",
      "owner/repo",
      tokenOptions,
    );

    expect(first.documents).toHaveLength(GITHUB_MAX_INDEX_FILES_PER_RUN);
    expect(first.has_more).toBe(true);
    expect(first.files_processed).toBe(GITHUB_MAX_INDEX_FILES_PER_RUN);

    const second = await fetchGithubRepoDocuments(config, "12345", "owner/repo", {
      ...tokenOptions,
      filesAlreadyProcessed: first.files_processed,
    });

    expect(second.documents).toHaveLength(40);
    expect(second.has_more).toBe(false);
    expect(second.files_processed).toBe(GITHUB_MAX_INDEX_FILES_PER_RUN + 40);
  });

  it("skips blobs larger than the byte cap", async () => {
    const requestUrl = (input: RequestInfo | URL): string => {
      if (typeof input === "string") {
        return input;
      }
      if (input instanceof URL) {
        return input.href;
      }
      return input.url;
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/git/trees/")) {
        return new Response(
          JSON.stringify({
            tree: [
              makeTreeBlob("small.md", "small", 10),
              makeTreeBlob("huge.md", "huge", GITHUB_MAX_FILE_BYTES + 1),
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/git/blobs/small")) {
        return new Response(
          JSON.stringify({ encoding: "base64", content: btoa("small file") }),
          { status: 200 },
        );
      }
      if (url.endsWith("/repos/owner/repo")) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchGithubRepoDocuments(config, "12345", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "token",
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].document_id).toBe("small.md");
  });
});
