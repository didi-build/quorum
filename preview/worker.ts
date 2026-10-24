export interface PreviewEnv {
  ASSETS: Fetcher;
}

function isAppSpaPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function wantsHtmlDocument(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/html");
}

function appSpaShellRequest(url: URL, request: Request): Request {
  const shellUrl = new URL("/app/index.html", url.origin);
  return new Request(shellUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

function shouldServeAppShell(
  url: URL,
  request: Request,
  assetResponse: Response,
): boolean {
  if (!isAppSpaPath(url.pathname)) {
    return false;
  }
  if (!wantsHtmlDocument(request)) {
    return false;
  }
  return assetResponse.status === 404 || assetResponse.status === 403;
}

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(new URL("/app/", url.origin), 302);
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (shouldServeAppShell(url, request, assetResponse)) {
      return env.ASSETS.fetch(appSpaShellRequest(url, request));
    }

    return assetResponse;
  },
};
