import { createHttpSourcesApi } from "./http";
import { createMockSourcesApi } from "./mock";
import type { SourcesApi } from "./types";

let apiInstance: SourcesApi | null = null;

function shouldUseMock(): boolean {
  if (import.meta.env.VITE_SOURCES_MOCK === "true") {
    return true;
  }
  if (import.meta.env.VITE_SOURCES_MOCK === "false") {
    return false;
  }
  return import.meta.env.DEV;
}

export function getSourcesApi(): SourcesApi {
  if (!apiInstance) {
    apiInstance = shouldUseMock() ? createMockSourcesApi() : createHttpSourcesApi();
  }
  return apiInstance;
}

export function setSourcesApi(api: SourcesApi | null): void {
  apiInstance = api;
}

export function oauthAuthorizeUrl(provider: "github" | "linear"): string {
  return `/oauth/${provider}/authorize`;
}

export { SourcesApiError } from "./errors";
export type { SourcesApi } from "./types";
export {
  createMockSourcesApi,
  mockConnectionsNone,
  mockSourcesEmpty,
  type MockSourcesOptions,
} from "./mock";
