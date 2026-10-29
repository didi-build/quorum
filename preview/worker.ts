import {
  appSpaShellRequest,
  gallerySpaShellRequest,
  shouldServeAppShell,
  shouldServeGalleryShell,
} from "./spa-routing.js";

export interface PreviewEnv {
  ASSETS: Fetcher;
}

const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

function withNoIndex(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(NOINDEX_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);

    const assetResponse = await env.ASSETS.fetch(request);

    if (shouldServeGalleryShell(url, request, assetResponse)) {
      return withNoIndex(await env.ASSETS.fetch(gallerySpaShellRequest(url, request)));
    }

    if (shouldServeAppShell(url, request, assetResponse)) {
      return withNoIndex(await env.ASSETS.fetch(appSpaShellRequest(url, request)));
    }

    return withNoIndex(assetResponse);
  },
};
