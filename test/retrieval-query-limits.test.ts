import { describe, expect, it } from "vitest";
import { parseRetrievalRequest } from "../src/routes/retrieval.js";
import { RETRIEVAL_QUERY_MAX_LENGTH } from "../src/domain/retrieval/query-limits.js";

describe("parseRetrievalRequest", () => {
  it("returns 400 when query exceeds max length", () => {
    const response = parseRetrievalRequest({
      query: "x".repeat(RETRIEVAL_QUERY_MAX_LENGTH + 1),
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });

  it("returns 400 when top_k is 51", () => {
    const response = parseRetrievalRequest({ query: "hello", top_k: 51 });
    expect((response as Response).status).toBe(400);
  });
});
