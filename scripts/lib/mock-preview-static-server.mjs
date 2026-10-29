import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  matchPreviewRedirect,
  readPreviewStaticMeta,
  withPreviewStaticHeaders,
} from "./mock-preview-static-meta.mjs";

/** Mirrors preview/spa-routing.ts for local mock-preview dist serving. */
function isAppSpaPath(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isGallerySpaPath(pathname) {
  return pathname === "/gallery" || pathname.startsWith("/gallery/");
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

function shouldServeGalleryShell(url, request, assetStatus) {
  if (!isGallerySpaPath(url.pathname)) {
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
 * @param {{ meta?: ReturnType<typeof readPreviewStaticMeta> }} [options]
 */
export function handleMockPreviewStaticRequest(request, distRoot, options = {}) {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const meta = options.meta ?? readPreviewStaticMeta(distRoot);

  const finish = (response) => withPreviewStaticHeaders(response, meta.globalHeaders);

  if (url.pathname === "/_redirects" || url.pathname === "/_headers") {
    return finish({ status: 404, headers: {}, body: "Not Found" });
  }

  const redirect = matchPreviewRedirect(url.pathname, url.origin, meta.redirects);
  if (redirect) {
    return finish({
      status: redirect.status,
      headers: { Location: redirect.location },
      body: null,
    });
  }

  if (url.pathname === "/" || url.pathname === "") {
    const landingPath = path.join(distRoot, "index.html");
    if (fileExists(landingPath)) {
      return finish({
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: readFile(landingPath),
      });
    }
    return finish({
      status: 302,
      headers: { Location: new URL("/app/", url.origin).toString() },
      body: null,
    });
  }

  if (url.pathname === "/app" || url.pathname === "/app/") {
    const shellPath = path.join(distRoot, "app", "index.html");
    if (fileExists(shellPath)) {
      return finish({
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: readFile(shellPath),
      });
    }
  }

  const directPath = resolveDistFile(distRoot, url.pathname);
  if (directPath && fileExists(directPath)) {
    const baseName = path.basename(directPath);
    if (baseName === "_redirects" || baseName === "_headers") {
      return finish({ status: 404, headers: {}, body: "Not Found" });
    }
    return finish({
      status: 200,
      headers: { "Content-Type": contentType(directPath) },
      body: readFile(directPath),
    });
  }

  const assetStatus = directPath && !fileExists(directPath) ? 404 : 403;
  if (shouldServeGalleryShell(url, request, assetStatus)) {
    const shellPath = path.join(distRoot, "gallery", "index.html");
    if (!fileExists(shellPath)) {
      return finish({ status: 404, headers: {}, body: "Not Found" });
    }
    return finish({
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: readFile(shellPath),
    });
  }

  if (shouldServeAppShell(url, request, assetStatus)) {
    const shellPath = path.join(distRoot, "app", "index.html");
    if (!fileExists(shellPath)) {
      return finish({ status: 500, headers: {}, body: "Missing app shell" });
    }
    return finish({
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: readFile(shellPath),
    });
  }

  return finish({ status: assetStatus, headers: {}, body: `${assetStatus}` });
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {string} landingRoot
 */
export function handleLandingStaticRequest(request, landingRoot) {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  if (url.pathname === "/health") {
    return {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: Buffer.from('{"status":"ok"}'),
    };
  }
  return handleMockPreviewStaticRequest(request, landingRoot, {
    meta: { redirects: [], globalHeaders: {} },
  });
}

/**
 * Serves the marketing landing page from repo `landing/` (index.html + style.css).
 * @param {{ root: string, host?: string, port?: number }} options
 */
export function startLandingStaticServer(options) {
  const landingRoot = path.resolve(options.root);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = http.createServer((req, res) => {
    const result = handleLandingStaticRequest(req, landingRoot);
    res.writeHead(result.status, result.headers);
    if (result.body !== null && req.method !== "HEAD") {
      res.end(result.body);
    } else {
      res.end();
    }
  });

  return startServerPromise(server, host, port);
}

export function startMockPreviewStaticServer(options) {
  const distRoot = path.resolve(options.distRoot);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const meta = readPreviewStaticMeta(distRoot);

  const server = http.createServer((req, res) => {
    const result = handleMockPreviewStaticRequest(req, distRoot, { meta });
    res.writeHead(result.status, result.headers);
    if (result.body !== null && req.method !== "HEAD") {
      res.end(result.body);
    } else {
      res.end();
    }
  });

  return startServerPromise(server, host, port);
}

function startServerPromise(server, host, port) {
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
