import { createHttpSourcesApi } from "./http";
import { resolveSourcesMockMode } from "./mode";
import type { SourcesApi } from "./types";

let apiInstance: SourcesApi | null = null;

export function getSourcesMockMode(): "mock" | "http" {
  return resolveSourcesMockMode({
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    VITE_SOURCES_MOCK: import.meta.env.VITE_SOURCES_MOCK,
  });
}

export async function resolveSourcesApi(): Promise<SourcesApi> {
  if (apiInstance) {
    return apiInstance;
  }
  if (import.meta.env.DEV && getSourcesMockMode() === "mock") {
    const { createMockSourcesApi } = await import("./mock");
    apiInstance = createMockSourcesApi();
  } else {
    apiInstance = createHttpSourcesApi();
  }
  return apiInstance;
}

export function getSourcesApi(): SourcesApi {
  if (apiInstance) {
    return apiInstance;
  }
  if (getSourcesMockMode() === "http") {
    apiInstance = createHttpSourcesApi();
    return apiInstance;
  }
  throw new Error(
    "Sources API is not ready. Await resolveSourcesApi() in development.",
  );
}

export function setSourcesApi(api: SourcesApi | null): void {
  apiInstance = api;
}

export function oauthAuthorizeUrl(provider: "github" | "linear"): string {
  return `/oauth/${provider}/authorize`;
}

export { SourcesApiError } from "./errors";
export type { SourcesApi } from "./types";
export { resolveSourcesMockMode } from "./mode";
