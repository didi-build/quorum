import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import { RetrievalUpstreamError } from "../src/domain/retrieval/errors.js";
import * as retrievalService from "../src/domain/retrieval/service.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import { handleRetrievalRoute } from "../src/routes/retrieval.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const USER = "00000000-0000-4000-8000-000000000010";
const PROJECT = "10000000-0000-4000-8000-000000000001";

describe("handleRetrievalRoute upstream mapping", () => {
  it("returns 503 when retrieve throws RetrievalUpstreamError for Vectorize", async () => {
    const config = loadConfig(withTestConfigEnv({}));
    const retrieveSpy = vi
      .spyOn(retrievalService, "retrieve")
      .mockRejectedValue(new RetrievalUpstreamError(503));

    const response = await handleRetrievalRoute(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "permissions model access control" }),
      }),
      {
        DB: {} as D1Database,
        VECTORIZE: {} as VectorizeIndex,
      } as import("../src/env.js").Env,
      config,
      "/retrieval/query",
      actorContext(USER, PROJECT),
    );

    retrieveSpy.mockRestore();
    expect(response?.status).toBe(503);
    const body = (await response!.json()) as { detail: string };
    expect(body.detail).toBe("Retrieval upstream unavailable");
  });
});
