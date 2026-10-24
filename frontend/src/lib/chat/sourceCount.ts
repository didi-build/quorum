import type { KnowledgeSourceListResponse } from "../../types/sources";
import { userFacingChatError } from "./errors";
import { isChatMockMode } from "./mockMode";
import { resolveChatTransport } from "./transport";
import type { MockChatTransport } from "./transport/mock";

async function parseSources(response: Response): Promise<KnowledgeSourceListResponse> {
  if (!response.ok) {
    const detail = await response.text();
    throw userFacingChatError(response.status, detail);
  }
  return (await response.json()) as KnowledgeSourceListResponse;
}

/** Ready source count for the chat status line (isolated from Connections UI). */
export async function fetchReadySourceCount(): Promise<number> {
  if (isChatMockMode()) {
    const transport = await resolveChatTransport();
    const mock = transport as MockChatTransport;
    if (typeof mock.readySourceCount === "number") {
      return mock.readySourceCount;
    }
    return 0;
  }

  const response = await fetch("/sources", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await parseSources(response);
  return payload.sources.filter((source) => source.status === "ready").length;
}
