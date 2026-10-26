import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/** Mirrors preview/spa-routing.ts for local mock-preview dist serving. */
function isAppSpaPath(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function wantsHtmlDocument(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const accept = request.headers.accept ?? "";
  return accept.includes("text/html");
}

function shouldServeAppShell(url, request, assetStatus) {
  if (!isAppSpaPath(url.pathname)) {
    return false;
  }
  if (!wantsHtmlDocument(request)) {
    return false;
  }
  return assetStatus === 404 || assetStatus === 403;
}

function resolveDistFile(distRoot, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? urlPath);
  const relative = decoded.replace(/^\/+/, "");
  const candidate = path.join(distRoot, relative);
  const normalizedRoot = path.resolve(distRoot);
  const normalizedCandidate = path.resolve(candidate);
  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    return null;
  }
  return normalizedCandidate;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {string} distRoot
 */
export function handleMockPreviewStaticRequest(request, distRoot) {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);

  if (url.pathname === "/" || url.pathname === "") {
    const landingPath = path.join(distRoot, "index.html");
    if (fileExists(landingPath)) {
      return {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: readFile(landingPath),
      };
    }
    return {
      status: 302,
      headers: { Location: new URL("/app/", url.origin).toString() },
      body: null,
    };
  }

  const directPath = resolveDistFile(distRoot, url.pathname);
  if (directPath && fileExists(directPath)) {
    return {
      status: 200,
      headers: { "Content-Type": contentType(directPath) },
      body: readFile(directPath),
    };
  }

  const assetStatus = directPath && !fileExists(directPath) ? 404 : 403;
  if (shouldServeAppShell(url, request, assetStatus)) {
    const shellPath = path.join(distRoot, "app", "index.html");
    if (!fileExists(shellPath)) {
      return { status: 500, headers: {}, body: "Missing app shell" };
    }
    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: readFile(shellPath),
    };
  }

  return { status: assetStatus, headers: {}, body: `${assetStatus}` };
}

/**
 * @param {{ distRoot: string, host?: string, port?: number }} options
 */
/**
 * Serves the marketing landing page from repo `landing/` (index.html + style.css).
 * @param {{ root: string, host?: string, port?: number }} options
 */
export function startLandingStaticServer(options) {
  return startMockPreviewStaticServer({
    distRoot: options.root,
    host: options.host,
    port: options.port,
  });
}

export function startMockPreviewStaticServer(options) {
  const distRoot = path.resolve(options.distRoot);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = http.createServer((req, res) => {
    const result = handleMockPreviewStaticRequest(req, distRoot);
    res.writeHead(result.status, result.headers);
    if (result.body !== null && req.method !== "HEAD") {
      res.end(result.body);
    } else {
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind mock-preview static server"));
        return;
      }
      resolve({
        server,
        baseUrl: `http://${host}:${address.port}`,
        async close() {
          await new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          });
        },
      });
    });
  });
}
