export function isAppSpaPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function wantsHtmlDocument(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/html");
}

export function appSpaShellRequest(url: URL, request: Request): Request {
  const shellUrl = new URL("/app/index.html", url.origin);
  return new Request(shellUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

export function shouldServeAppShell(
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
