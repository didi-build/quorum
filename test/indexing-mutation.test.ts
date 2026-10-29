import { describe, expect, it, vi } from "vitest";
import { VoyageEmbedError } from "../src/domain/ingestion/embedder.js";
import {
  GENERIC_INDEXING_FAILURE_MESSAGE,
  IndexingHttpError,
  IndexingPermanentError,
} from "../src/domain/ingestion/errors.js";
import {
  isIndexingTemporaryError,
  indexingErrorLogFields,
} from "../src/domain/ingestion/indexing-retry.js";
import { resolveIndexingRun } from "../src/domain/ingestion/indexing-run.js";
import * as pipeline from "../src/domain/ingestion/pipeline.js";
import { handleIndexingQueueBatch } from "../src/jobs/indexing-consumer.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

describe("indexing mutation guards (DIDI-933)", () => {
  it("B4: network TypeError failures remain retryable without a TypeError-only branch", () => {
    expect(isIndexingTemporaryError(new TypeError("fetch failed"))).toBe(true);
    expect(indexingErrorLogFields(new TypeError("fetch failed"))).toEqual({
      error: "TypeError",
    });
  });

  it("B6: consumer acks non-temporary throws without retry", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000060";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new IndexingPermanentError("deterministic"),
    );
    const markError = vi
      .spyOn(pipeline, "markKnowledgeSourceIndexingError")
      .mockResolvedValue(undefined);

    const message = {
      body: { source_id: sourceId },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
    expect(markError).toHaveBeenCalledWith(
      env.DB,
      sourceId,
      GENERIC_INDEXING_FAILURE_MESSAGE,
      null,
    );

    vi.restoreAllMocks();
  });

  it("B9: resolveIndexingRun rejects a fresh run id mismatch on a ready source", () => {
    const result = resolveIndexingRun(
      {
        source_id: "s1",
        indexing_run_id: "00000000-0000-4000-8000-000000000061",
      },
      {
        indexing_run_id: "00000000-0000-4000-8000-000000000062",
        indexing_run_files_committed: 10,
        status: "ready",
      },
      true,
    );
    expect(result.stale).toBe(true);
  });

  it("B11: resolveIndexingRun requires claiming a new run on pending sources", () => {
    const result = resolveIndexingRun(
      { source_id: "s1" },
      { indexing_run_id: null, indexing_run_files_committed: null, status: "pending" },
      true,
    );
    expect(result.mustClaimRun).toBe(true);
    expect(result.runId).not.toBeNull();
  });

  it("permanent HTTP errors are not temporary", () => {
    expect(isIndexingTemporaryError(new IndexingHttpError(401))).toBe(false);
    expect(isIndexingTemporaryError(new IndexingPermanentError("bad config"))).toBe(
      false,
    );
    expect(isIndexingTemporaryError(new VoyageEmbedError(503))).toBe(true);
  });

  it("QA-1: resolveIndexingRun drops a fresh message when indexing progress is committed", () => {
    const runId = "00000000-0000-4000-8000-000000000070";
    const result = resolveIndexingRun(
      { source_id: "s1" },
      {
        indexing_run_id: runId,
        indexing_run_files_committed: 25,
        status: "indexing",
      },
      true,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });

  it("QA-3: resolveIndexingRun must claim when pending already has another run id", () => {
    const incumbent = "00000000-0000-4000-8000-000000000071";
    const result = resolveIndexingRun(
      { source_id: "s1" },
      {
        indexing_run_id: incumbent,
        indexing_run_files_committed: null,
        status: "pending",
      },
      true,
    );
    expect(result.stale).toBe(false);
    expect(result.mustClaimRun).toBe(true);
    expect(result.runId).not.toBe(incumbent);
  });
});
