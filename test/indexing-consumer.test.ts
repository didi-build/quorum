import { describe, expect, it, vi } from "vitest";
import { ConfigError } from "../src/config/errors.js";
import * as loadConfigModule from "../src/config/load-config.js";
import * as pipeline from "../src/domain/ingestion/pipeline.js";
import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../src/domain/ingestion/errors.js";
import { VoyageEmbedError } from "../src/domain/ingestion/embedder.js";
import { handleIndexingQueueBatch } from "../src/jobs/indexing-consumer.js";
import { INDEXING_QUEUE_MAX_RETRIES } from "../src/jobs/indexing-queue-constants.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

function mockMessage(
  body: { source_id: string },
  attempts: number,
): {
  body: { source_id: string };
  attempts: number;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
} {
  return {
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

describe("handleIndexingQueueBatch", () => {
  it("retries temporary failures before the final attempt", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000099";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new VoyageEmbedError(503),
    );
    const markError = vi
      .spyOn(pipeline, "markKnowledgeSourceIndexingError")
      .mockResolvedValue(undefined);

    const retryMessage = mockMessage(
      { source_id: sourceId },
      INDEXING_QUEUE_MAX_RETRIES,
    );
    await handleIndexingQueueBatch(
      { messages: [retryMessage] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );
    expect(retryMessage.retry).toHaveBeenCalled();
    expect(retryMessage.ack).not.toHaveBeenCalled();
    expect(markError).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("acks successful pipeline results without retry", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000098";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockResolvedValue({
      done: true,
      continuation: null,
    });

    const message = mockMessage({ source_id: sourceId }, 1);
    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("marks error on the final attempt after temporary failures", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000099";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new VoyageEmbedError(503),
    );
    const markError = vi
      .spyOn(pipeline, "markKnowledgeSourceIndexingError")
      .mockResolvedValue(undefined);

    const finalMessage = mockMessage(
      { source_id: sourceId },
      INDEXING_QUEUE_MAX_RETRIES + 1,
    );
    await handleIndexingQueueBatch(
      { messages: [finalMessage] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );
    expect(finalMessage.ack).toHaveBeenCalled();
    expect(finalMessage.retry).not.toHaveBeenCalled();
    expect(markError).toHaveBeenCalledWith(
      env.DB,
      sourceId,
      GENERIC_INDEXING_FAILURE_MESSAGE,
    );

    vi.restoreAllMocks();
  });

  it("acks stale pipeline results without retry", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000055";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    const indexSpy = vi.spyOn(pipeline, "indexKnowledgeSource").mockResolvedValue({
      done: true,
      continuation: null,
      stale: true,
    });

    const message = mockMessage({ source_id: sourceId }, 1);
    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(indexSpy).toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("enqueues continuation messages before ack", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000088";
    const send = vi.fn();
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockResolvedValue({
      done: false,
      continuation: { source_id: sourceId, github_files_processed: 150 },
    });

    const message = mockMessage({ source_id: sourceId }, 1);
    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(send).toHaveBeenCalledWith({
      source_id: sourceId,
      github_files_processed: 150,
    });
    expect(message.ack).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("acks on final attempt when config load fails", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000077";
    const env = {
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(loadConfigModule, "loadConfig").mockImplementation(() => {
      throw ConfigError.invalid("VOYAGE_API_KEY");
    });
    const markError = vi
      .spyOn(pipeline, "markKnowledgeSourceIndexingError")
      .mockResolvedValue(undefined);

    const finalMessage = mockMessage(
      { source_id: sourceId },
      INDEXING_QUEUE_MAX_RETRIES + 1,
    );
    await handleIndexingQueueBatch(
      { messages: [finalMessage] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(finalMessage.ack).toHaveBeenCalled();
    expect(finalMessage.retry).not.toHaveBeenCalled();
    expect(markError).toHaveBeenCalledWith(
      env.DB,
      sourceId,
      GENERIC_INDEXING_FAILURE_MESSAGE,
    );

    vi.restoreAllMocks();
  });

  it("still acks on final attempt when marking error throws", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000066";
    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new Error("unexpected"),
    );
    vi.spyOn(pipeline, "markKnowledgeSourceIndexingError").mockRejectedValue(
      new Error("d1 unavailable"),
    );

    const finalMessage = mockMessage(
      { source_id: sourceId },
      INDEXING_QUEUE_MAX_RETRIES + 1,
    );
    await handleIndexingQueueBatch(
      { messages: [finalMessage] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    expect(finalMessage.ack).toHaveBeenCalled();
    expect(finalMessage.retry).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
