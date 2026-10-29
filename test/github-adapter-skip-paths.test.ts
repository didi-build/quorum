import { describe, expect, it, vi } from "vitest";
import { fetchGithubRepoDocuments } from "../src/domain/ingestion/adapters/github.js";
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

const KEEP_PATH = "docs/keep.md";
const KEEP_SHA = "keep-sha";
const KEEP_BODY = btoa("# kept\n");

function baseFetchImpl(
  tree: Array<Record<string, unknown>>,
  blobBodies: Record<string, { encoding: string; content: string }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.endsWith("/repos/owner/repo")) {
      return new Response(JSON.stringify({ default_branch: "main" }), {
        status: 200,
      });
    }
    if (url.includes("/git/trees/")) {
      return new Response(JSON.stringify({ tree }), { status: 200 });
    }
    if (url.includes(`/git/blobs/${KEEP_SHA}`)) {
      return new Response(JSON.stringify({ encoding: "base64", content: KEEP_BODY }), {
        status: 200,
      });
    }
    for (const [sha, body] of Object.entries(blobBodies)) {
      if (sha && url.includes(`/git/blobs/${sha}`)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    if (url.match(/\/git\/blobs\/?$/)) {
      return new Response(
        JSON.stringify({
          encoding: "base64",
          content: btoa("# empty-sha fallback\n"),
        }),
        { status: 200 },
      );
    }
    if (url.includes("/git/blobs/")) {
      return new Response("missing", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  });
}

const keepBlob = {
  type: "blob",
  path: KEEP_PATH,
  sha: KEEP_SHA,
  size: KEEP_BODY.length,
};

describe("fetchGithubRepoDocuments v1 skip paths (table)", () => {
  it.each([
    {
      label: "non-blob tree entries",
      extraTree: [{ type: "tree", path: "src/nested.md", sha: "tree-sha" }],
      blobBodies: {
        "tree-sha": { encoding: "base64", content: btoa("# tree-as-blob\n") },
      },
    },
    {
      label: "empty blob paths",
      extraTree: [{ type: "blob", path: "", sha: "empty-path-sha", size: 10 }],
      blobBodies: {
        "empty-path-sha": {
          encoding: "base64",
          content: btoa("# empty path would index\n"),
        },
      },
    },
    {
      label: "paths without a text extension",
      extraTree: [{ type: "blob", path: "assets/logo.png", sha: "png-sha", size: 4 }],
      blobBodies: {
        "png-sha": { encoding: "base64", content: btoa("png-bytes") },
      },
    },
    {
      label: "paths under .git/",
      extraTree: [
        {
          type: "blob",
          path: ".git/notes.md",
          sha: "git-notes-sha",
          size: 4,
        },
      ],
      blobBodies: {
        "git-notes-sha": { encoding: "base64", content: btoa("git notes") },
      },
    },
    {
      label: "paths under node_modules/",
      extraTree: [
        {
          type: "blob",
          path: "packages/app/node_modules/pkg/readme.md",
          sha: "nm-sha",
          size: 4,
        },
      ],
      blobBodies: {
        "nm-sha": { encoding: "base64", content: btoa("dependency doc") },
      },
    },
    {
      label: "paths under .venv/",
      extraTree: [
        {
          type: "blob",
          path: "services/api/.venv/lib/notes.txt",
          sha: "venv-sha",
          size: 4,
        },
      ],
      blobBodies: {
        "venv-sha": { encoding: "base64", content: btoa("venv notes") },
      },
    },
    {
      label: "tree size over the byte cap",
      extraTree: [
        {
          type: "blob",
          path: "huge.md",
          sha: "huge-sha",
          size: GITHUB_MAX_FILE_BYTES + 1,
        },
      ],
    },
    {
      label: "missing blob sha",
      extraTree: [{ type: "blob", path: "no-sha.md", sha: "", size: 4 }],
    },
    {
      label: "blob fetch failures",
      extraTree: [
        {
          type: "blob",
          path: "missing-blob.md",
          sha: "404-sha",
          size: 4,
        },
      ],
    },
    {
      label: "non-base64 blob encoding",
      extraTree: [
        {
          type: "blob",
          path: "utf8.md",
          sha: "utf8-sha",
          size: 4,
        },
      ],
      blobBodies: {
        "utf8-sha": { encoding: "utf-8", content: "plain" },
      },
    },
    {
      label: "decoded bytes over the byte cap",
      extraTree: [
        {
          type: "blob",
          path: "understated.md",
          sha: "under-sha",
          size: 10,
        },
      ],
      blobBodies: {
        "under-sha": {
          encoding: "base64",
          content: btoa("a".repeat(GITHUB_MAX_FILE_BYTES + 1)),
        },
      },
    },
    {
      label: "whitespace-only blob content",
      extraTree: [
        {
          type: "blob",
          path: "blank.md",
          sha: "blank-sha",
          size: 4,
        },
      ],
      blobBodies: {
        "blank-sha": { encoding: "base64", content: btoa("   \n\t  ") },
      },
    },
  ])("skips $label", async ({ extraTree, blobBodies }) => {
    const bodies =
      (blobBodies as
        Record<string, { encoding: string; content: string }> | undefined) ?? {};
    const fetchImpl = baseFetchImpl([keepBlob, ...extraTree], bodies);

    const result = await fetchGithubRepoDocuments(config, "1", "owner/repo", {
      fetchImpl,
      getInstallationAccessToken: async () => "fixture-token",
    });

    expect(result.documents.map((doc) => doc.document_id)).toEqual([KEEP_PATH]);
  });
});

describe("github blob path guard (v1 mirror for empty path)", () => {
  function shouldSkipPath(path: string): boolean {
    return (
      path.startsWith(".git/") ||
      path.includes("/node_modules/") ||
      path.includes("/.venv/")
    );
  }

  function skipBlobPath(
    path: string,
    hasTextExtension: (candidate: string) => boolean,
  ): boolean {
    return !path || !hasTextExtension(path) || shouldSkipPath(path);
  }

  it("skips an empty path even when extension check would pass", () => {
    const path = "";
    const extensionAlways = (_candidate: string) => true;

    expect(skipBlobPath(path, extensionAlways)).toBe(true);
    expect(!extensionAlways(path)).toBe(false);
  });
});
