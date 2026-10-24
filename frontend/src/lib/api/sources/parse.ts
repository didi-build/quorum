import { SourcesApiError } from "./errors";

export function parseResponseJson(text: string, status: number): unknown {
  if (!text.trim()) {
    throw new SourcesApiError(status, "Empty response body");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourcesApiError(status, "Invalid JSON response");
  }
}

export function expectJsonArray<T>(data: unknown, status: number): T[] {
  if (!Array.isArray(data)) {
    throw new SourcesApiError(status, "Expected a JSON array response");
  }
  return data as T[];
}
