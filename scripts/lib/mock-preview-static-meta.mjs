import fs from "node:fs";
import path from "node:path";

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} distRoot
 */
export function readPreviewStaticMeta(distRoot) {
  const redirects = [];
  const globalHeaders = {};

  const redirectsPath = path.join(distRoot, "_redirects");
  if (fileExists(redirectsPath)) {
    const lines = fs.readFileSync(redirectsPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        redirects.push({
          from: parts[0],
          to: parts[1],
          status: Number(parts[2]),
        });
      }
    }
  }

  const headersPath = path.join(distRoot, "_headers");
  if (fileExists(headersPath)) {
    for (const line of fs.readFileSync(headersPath, "utf8").split("\n")) {
      const match = line.match(/^\s+([^:]+):\s*(.+)$/);
      if (match) {
        globalHeaders[match[1].trim()] = match[2].trim();
      }
    }
  }

  return { redirects, globalHeaders };
}

/**
 * @param {{ status: number, headers: Record<string, string>, body: Buffer | string | null }} response
 * @param {Record<string, string>} globalHeaders
 */
export function withPreviewStaticHeaders(response, globalHeaders) {
  if (!globalHeaders || Object.keys(globalHeaders).length === 0) {
    return response;
  }
  return {
    ...response,
    headers: { ...response.headers, ...globalHeaders },
  };
}

/**
 * @param {string} pathname
 * @param {string} origin
 * @param {{ from: string, to: string, status: number }[]} redirects
 */
export function matchPreviewRedirect(pathname, origin, redirects) {
  for (const rule of redirects) {
    if (rule.from !== pathname) {
      continue;
    }
    const location = rule.to.startsWith("/")
      ? new URL(rule.to, origin).toString()
      : rule.to;
    return { status: rule.status, location };
  }
  return null;
}
