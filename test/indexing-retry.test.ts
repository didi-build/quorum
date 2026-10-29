import { describe, expect, it } from "vitest";
import { VoyageEmbedError } from "../src/domain/ingestion/embedder.js";
import {
  IndexingHttpError,
  IndexingPermanentError,
} from "../src/domain/ingestion/errors.js";
import {
  isIndexingTemporaryError,
  indexingErrorLogFields,
} from "../src/domain/ingestion/indexing-retry.js";

describe("isIndexingTemporaryError", () => {
  it("treats 429 and 5xx HTTP errors as temporary", () => {
    expect(isIndexingTemporaryError(new IndexingHttpError(429))).toBe(true);
    expect(isIndexingTemporaryError(new IndexingHttpError(500))).toBe(true);
    expect(isIndexingTemporaryError(new VoyageEmbedError(503))).toBe(true);
  });

  it("treats other 4xx HTTP errors as permanent", () => {
    expect(isIndexingTemporaryError(new IndexingHttpError(401))).toBe(false);
    expect(isIndexingTemporaryError(new IndexingHttpError(404))).toBe(false);
    expect(isIndexingTemporaryError(new VoyageEmbedError(400))).toBe(false);
  });

  it("treats IndexingPermanentError as permanent", () => {
    expect(
      isIndexingTemporaryError(new IndexingPermanentError("missing installation_id")),
    ).toBe(false);
  });

  it("treats network and generic errors as temporary", () => {
    expect(isIndexingTemporaryError(new TypeError("fetch failed"))).toBe(true);
    expect(isIndexingTemporaryError(new Error("provider timeout"))).toBe(true);
  });
});

describe("indexingErrorLogFields", () => {
  it("includes status_code for HTTP errors", () => {
    expect(indexingErrorLogFields(new IndexingHttpError(502))).toEqual({
      error: "IndexingHttpError",
      status_code: 502,
    });
  });

  it("includes only error name otherwise", () => {
    expect(indexingErrorLogFields(new Error("boom"))).toEqual({
      error: "Error",
    });
  });
});
