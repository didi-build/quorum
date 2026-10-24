import type { Connection, AvailableSourceItem } from "../../../types/connections";
import type { KnowledgeSource } from "../../../types/sources";
import { SourcesApiError } from "./errors";
import { expectJsonArray, parseResponseJson } from "./parse";
import type { SourcesApi } from "./types";

async function requestEmpty(
  path: string,
  init: RequestInit = {},
  provider?: string,
): Promise<void> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      if (text.trim()) {
        const body = parseResponseJson(text, response.status) as { detail?: string };
        detail = typeof body.detail === "string" ? body.detail : "";
      }
    } catch {
      // ignore parse errors for error bodies
    }
    throw new SourcesApiError(response.status, detail, provider);
  }

  if (response.status === 204) {
    return;
  }

  const text = await response.text();
  if (!text.trim()) {
    return;
  }
  parseResponseJson(text, response.status);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  provider?: string,
  parse?: (data: unknown, status: number) => T,
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
      const text = await response.text();
      if (text.trim()) {
        const body = parseResponseJson(text, response.status) as { detail?: string };
        detail = typeof body.detail === "string" ? body.detail : "";
      }
    } catch {
      // ignore parse errors for error bodies
    }
    throw new SourcesApiError(response.status, detail, provider);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = parseResponseJson(text, response.status);
  if (parse) {
    return parse(data, response.status);
  }
  return data as T;
}

function parseList<T>(data: unknown, status: number): T[] {
  return expectJsonArray<T>(data, status);
}

export function createHttpSourcesApi(): SourcesApi {
  return {
    listConnections: () =>
      request<Connection[]>("/connections", {}, undefined, parseList<Connection>),
    listSources: () =>
      request<KnowledgeSource[]>("/sources", {}, undefined, parseList<KnowledgeSource>),
    refreshSource: (id) =>
      request<KnowledgeSource>(
        `/sources/${encodeURIComponent(id)}/refresh`,
        { method: "POST" },
        undefined,
        (data, status) => {
          if (Array.isArray(data)) {
            throw new SourcesApiError(status, "Expected a single source object");
          }
          if (!data || typeof data !== "object") {
            throw new SourcesApiError(status, "Expected a single source object");
          }
          return data as KnowledgeSource;
        },
      ),
    deleteSource: (id) =>
      requestEmpty(`/sources/${encodeURIComponent(id)}`, { method: "DELETE" }),
    listAvailableSources: (connectionId, provider) =>
      request<AvailableSourceItem[]>(
        `/connections/${encodeURIComponent(connectionId)}/available-sources`,
        {},
        provider,
        parseList<AvailableSourceItem>,
      ),
    createSources: (items) =>
      request<KnowledgeSource[]>(
        "/sources",
        {
          method: "POST",
          body: JSON.stringify({ sources: items }),
        },
        undefined,
        parseList<KnowledgeSource>,
      ),
  };
}
