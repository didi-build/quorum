import type { Connection, AvailableSourceItem } from "../../../types/connections";
import type { KnowledgeSource } from "../../../types/sources";
import { SourcesApiError } from "./errors";
import type { SourcesApi } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  provider?: string,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: string };
      detail = typeof body.detail === "string" ? body.detail : "";
    } catch {
      // ignore parse errors
    }
    throw new SourcesApiError(response.status, detail, provider);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return parseJson<T>(response);
}

export function createHttpSourcesApi(): SourcesApi {
  return {
    listConnections: () => request<Connection[]>("/connections"),
    listSources: () => request<KnowledgeSource[]>("/sources"),
    refreshSource: (id) =>
      request<KnowledgeSource>(`/sources/${encodeURIComponent(id)}/refresh`, {
        method: "POST",
      }),
    deleteSource: (id) =>
      request<void>(`/sources/${encodeURIComponent(id)}`, { method: "DELETE" }),
    listAvailableSources: (connectionId, provider) =>
      request<AvailableSourceItem[]>(
        `/connections/${encodeURIComponent(connectionId)}/available-sources`,
        {},
        provider,
      ),
    createSources: (items) =>
      request<KnowledgeSource[]>("/sources", {
        method: "POST",
        body: JSON.stringify({ sources: items }),
      }),
  };
}
