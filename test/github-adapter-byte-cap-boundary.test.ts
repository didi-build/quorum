import { describe, expect, it, vi } from "vitest";
import { fetchGithubRepoDocuments } from "../src/domain/ingestion/adapters/github.js";
import { GITHUB_MAX_FILE_BYTES } from "../src/domain/ingestion/constants.js";
import { loadConfig } from "../src/config/load-config.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv());

const CAP_BYTES = 524288;
const OVER_CAP_BYTES = 524289;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe("GITHUB_MAX_FILE_BYTES boundary (512 KiB)", () => {
  it("pins the literal 512 KiB cap constant", () => {
    expect(GITHUB_MAX_FILE_BYTES).toBe(CAP_BYTES);
  });

  it.each([
    {
      label: "tree size exactly at cap",
      treeSize: CAP_BYTES,
      expectIndexed: true,
    },
    {
      label: "tree size one byte over cap",
      treeSize: OVER_CAP_BYTES,
      expectIndexed: false,
    },
  ])("$label", async ({ treeSize, expectIndexed }) => {
    const path = "boundary.md";
    const sha = "boundary-sha";
    const text = "# boundary\n";
    const encoded = btoa(text);

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
            tree: [{ type: "blob", path, sha, size: treeSize }],
          }),
          { status: 200 },
        );
      }
      if (url.includes(`/git/blobs/${sha}`)) {
        blobFetches.push(url);
        return new Response(JSON.stringify({ encoding: "base64", content: encoded }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchGithubRepoDocuments(config, "1", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "fixture-token",
    });

    if (expectIndexed) {
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]?.document_id).toBe(path);
      expect(blobFetches).toHaveLength(1);
    } else {
      expect(result.documents).toHaveLength(0);
      expect(blobFetches).toHaveLength(0);
    }
  });

  it.each([
    {
      label: "decoded content exactly at cap",
      byteLength: CAP_BYTES,
      expectIndexed: true,
    },
    {
      label: "decoded content one byte over cap",
      byteLength: OVER_CAP_BYTES,
      expectIndexed: false,
    },
  ])("$label", async ({ byteLength, expectIndexed }) => {
    const path = "payload.md";
    const sha = "payload-sha";
    const payload = "x".repeat(byteLength);
    const encoded = btoa(payload);

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
            tree: [{ type: "blob", path, sha, size: 10 }],
          }),
          { status: 200 },
        );
      }
      if (url.includes(`/git/blobs/${sha}`)) {
        return new Response(JSON.stringify({ encoding: "base64", content: encoded }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await fetchGithubRepoDocuments(config, "1", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "fixture-token",
    });

    if (expectIndexed) {
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]?.content).toHaveLength(byteLength);
    } else {
      expect(result.documents).toHaveLength(0);
    }
  });
});
