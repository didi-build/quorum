import type { QuorumConfig } from "../../../config/types.js";
import { GITHUB_API_BASE, getInstallationAccessToken } from "../../oauth/github-app.js";
import { GITHUB_MAX_FILE_BYTES, GITHUB_MAX_INDEX_FILES_PER_RUN } from "../constants.js";
import { IndexingHttpError } from "../errors.js";
import type { FetchedDocument, GithubFetchResult } from "./types.js";

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".py",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".css",
  ".html",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".sql",
  ".sh",
  ".ini",
  ".cfg",
  ".env.example",
]);

export type GithubFetch = typeof fetch;

function shouldSkipPath(path: string): boolean {
  return (
    path.startsWith(".git/") ||
    path.includes("/node_modules/") ||
    path.includes("/.venv/")
  );
}

function hasTextExtension(path: string): boolean {
  for (const ext of TEXT_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

async function fetchDefaultBranch(
  repoFullName: string,
  headers: Record<string, string>,
  fetchImpl: GithubFetch,
): Promise<string> {
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${repoFullName}`, {
    headers,
  });
  if (!response.ok) {
    throw new IndexingHttpError(response.status);
  }
  const payload = (await response.json()) as { default_branch?: string };
  return payload.default_branch ?? "main";
}

async function fetchTree(
  repoFullName: string,
  ref: string,
  headers: Record<string, string>,
  fetchImpl: GithubFetch,
): Promise<Array<Record<string, unknown>>> {
  const response = await fetchImpl(
    `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers },
  );
  if (!response.ok) {
    throw new IndexingHttpError(response.status);
  }
  const payload = (await response.json()) as { tree?: Array<Record<string, unknown>> };
  return payload.tree ?? [];
}

export type InstallationAccessTokenGetter = (
  config: QuorumConfig,
  installationId: string,
) => Promise<string>;

export interface FetchGithubRepoDocumentsOptions {
  filesAlreadyProcessed?: number;
  fetchImpl?: GithubFetch;
  getInstallationAccessToken?: InstallationAccessTokenGetter;
}

export async function fetchGithubRepoDocuments(
  config: QuorumConfig,
  installationId: string,
  repoFullName: string,
  options: FetchGithubRepoDocumentsOptions = {},
): Promise<GithubFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const filesAlreadyProcessed = options.filesAlreadyProcessed ?? 0;
  const remainingBudget = GITHUB_MAX_INDEX_FILES_PER_RUN;

  const resolveToken = options.getInstallationAccessToken ?? getInstallationAccessToken;
  const accessToken = await resolveToken(config, installationId);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
  };

  let tree: Array<Record<string, unknown>>;
  try {
    const defaultBranch = await fetchDefaultBranch(repoFullName, headers, fetchImpl);
    try {
      tree = await fetchTree(repoFullName, defaultBranch, headers, fetchImpl);
    } catch (error) {
      if (error instanceof IndexingHttpError && error.statusCode === 404) {
        tree = await fetchTree(repoFullName, "HEAD", headers, fetchImpl);
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof IndexingHttpError && error.statusCode === 404) {
      tree = await fetchTree(repoFullName, "HEAD", headers, fetchImpl);
    } else {
      throw error;
    }
  }

  const documents: FetchedDocument[] = [];
  let eligibleSeen = 0;
  let hasMore = false;

  for (const item of tree) {
    if (item.type !== "blob") {
      continue;
    }
    const path = String(item.path ?? "");
    if (!path || !hasTextExtension(path) || shouldSkipPath(path)) {
      continue;
    }

    const size = typeof item.size === "number" ? item.size : 0;
    if (size > GITHUB_MAX_FILE_BYTES) {
      continue;
    }

    if (eligibleSeen < filesAlreadyProcessed) {
      eligibleSeen += 1;
      continue;
    }

    if (documents.length >= remainingBudget) {
      hasMore = true;
      continue;
    }

    const blobSha = String(item.sha ?? "");
    if (!blobSha) {
      continue;
    }

    const blobResponse = await fetchImpl(
      `${GITHUB_API_BASE}/repos/${repoFullName}/git/blobs/${blobSha}`,
      { headers },
    );
    if (!blobResponse.ok) {
      continue;
    }
    const blob = (await blobResponse.json()) as {
      encoding?: string;
      content?: string;
    };
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      continue;
    }

    const binary = atob(blob.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.byteLength > GITHUB_MAX_FILE_BYTES) {
      continue;
    }

    const content = new TextDecoder("utf-8").decode(bytes);
    if (!content.trim()) {
      continue;
    }

    documents.push({ document_id: path, content });
  }

  const filesProcessed = filesAlreadyProcessed + documents.length;

  return {
    documents,
    has_more: hasMore,
    files_processed: filesProcessed,
  };
}
