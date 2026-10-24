export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  INDEXING_QUEUE: Queue;
  VECTORIZE: VectorizeIndex;
}

function wantsHtmlDocument(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const accept = request.headers.get("Accept") ?? "";
  if (accept.includes("text/html")) {
    return true;
  }
  return accept === "" || accept === "*/*";
}

function appSpaShellRequest(url: URL, request: Request): Request {
  const shellUrl = new URL("/app/index.html", url.origin);
  return new Request(shellUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    const assetResponse = await env.ASSETS.fetch(request);

    const needsAppShell =
      url.pathname.startsWith("/app") &&
      wantsHtmlDocument(request) &&
      (assetResponse.status === 404 || assetResponse.status === 403);

    if (needsAppShell) {
      return env.ASSETS.fetch(appSpaShellRequest(url, request));
    }

    return assetResponse;
  },
};
