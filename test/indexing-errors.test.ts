import { describe, expect, it } from "vitest";
import {
  GENERIC_INDEXING_FAILURE_MESSAGE,
  IndexingHttpError,
  RECONNECT_WORKSPACE_MESSAGE,
  indexingErrorMessage,
} from "../src/domain/ingestion/errors.js";

describe("indexingErrorMessage", () => {
  it("maps auth errors to reconnect message", () => {
    expect(indexingErrorMessage(new IndexingHttpError(401))).toBe(
      RECONNECT_WORKSPACE_MESSAGE,
    );
    expect(indexingErrorMessage(new IndexingHttpError(403))).toBe(
      RECONNECT_WORKSPACE_MESSAGE,
    );
  });

  it("maps generic errors to retry message", () => {
    expect(indexingErrorMessage(new Error("boom"))).toBe(
      GENERIC_INDEXING_FAILURE_MESSAGE,
    );
    expect(indexingErrorMessage(new IndexingHttpError(500))).toBe(
      GENERIC_INDEXING_FAILURE_MESSAGE,
    );
  });
});
