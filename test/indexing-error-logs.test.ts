import { describe, expect, it, vi, afterEach } from "vitest";
import { ConfigError } from "../src/config/errors.js";
import { loadConfig } from "../src/config/load-config.js";
import * as loadConfigModule from "../src/config/load-config.js";
import * as pipeline from "../src/domain/ingestion/pipeline.js";
import { handleIndexingQueueBatch } from "../src/jobs/indexing-consumer.js";
import { INDEXING_QUEUE_MAX_RETRIES } from "../src/jobs/indexing-queue-constants.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const SOURCE_ID = "00000000-0000-4000-8000-000000000055";
const config = loadConfig(withTestConfigEnv());

class FixtureIndexingError extends Error {
  constructor() {
    super(
      "fixture-key-123 fixture token=fixture-token-456 query=https://example.test?q=fixture body=fixture-content-789",
    );
    this.name = "FixtureIndexingError";
  }
}

const forbiddenLogSubstrings = [
  "fixture-key-123",
  "fixture-token-456",
  "https://example.test?q=fixture",
  "fixture-content-789",
];

function logSurfaces(arg: unknown): string[] {
  const surfaces = [String(arg)];
  if (typeof arg === "object" && arg !== null && "stack" in arg) {
    surfaces.push(String((arg as { stack?: unknown }).stack));
  }
  return surfaces;
}

function assertNoLoggedErrorInstances(calls: unknown[][]): void {
  for (const call of calls) {
    for (const arg of call) {
      expect(arg).not.toBeInstanceOf(Error);
    }
  }
}

function assertIndexingErrorLogsSafe(
  calls: unknown[][],
  options: { expectedNames?: string[] } = {},
): void {
  for (const call of calls) {
    for (const arg of call) {
      const surfaces = logSurfaces(arg);
      if (typeof arg === "object" && arg !== null) {
        surfaces.push(JSON.stringify(arg));
        if ("error" in arg) {
          surfaces.push(String((arg as { error: unknown }).error));
        }
      }
      for (const surface of surfaces) {
        for (const fragment of forbiddenLogSubstrings) {
          expect(surface).not.toContain(fragment);
        }
      }
      if (typeof arg === "object" && arg !== null && "error" in arg) {
        const errorField = (arg as { error: unknown }).error;
        expect(typeof errorField).toBe("string");
        if (options.expectedNames) {
          expect(options.expectedNames).toContain(errorField);
        }
      }
    }
  }
}

describe("indexing error logs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs only the error name when the queue handler fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new FixtureIndexingError(),
    );
    vi.spyOn(pipeline, "markKnowledgeSourceIndexingError").mockResolvedValue(undefined);

    const message = {
      body: { source_id: SOURCE_ID },
      attempts: INDEXING_QUEUE_MAX_RETRIES + 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    const queueLogs = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Indexing queue message failed"),
    );
    expect(queueLogs.length).toBeGreaterThan(0);
    assertNoLoggedErrorInstances(errorSpy.mock.calls);
    assertIndexingErrorLogsSafe(queueLogs, { expectedNames: ["FixtureIndexingError"] });
  });

  it("logs only the error name when config load fails on the final attempt", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const env = {
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(loadConfigModule, "loadConfig").mockImplementation(() => {
      throw ConfigError.invalid("VOYAGE_API_KEY");
    });
    vi.spyOn(pipeline, "markKnowledgeSourceIndexingError").mockResolvedValue(undefined);

    const message = {
      body: { source_id: SOURCE_ID },
      attempts: INDEXING_QUEUE_MAX_RETRIES + 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    const queueLogs = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Indexing queue message failed"),
    );
    expect(queueLogs.length).toBeGreaterThan(0);
    assertNoLoggedErrorInstances(errorSpy.mock.calls);
    assertIndexingErrorLogsSafe(queueLogs, { expectedNames: ["ConfigError"] });
  });

  it("logs only the error name when final error mark fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const env = {
      ...withTestConfigEnv(),
      DB: {} as D1Database,
      VECTORIZE: {} as VectorizeIndex,
      INDEXING_QUEUE: { send: vi.fn() },
    } as unknown as import("../src/env.js").Env;

    vi.spyOn(pipeline, "indexKnowledgeSource").mockRejectedValue(
      new FixtureIndexingError(),
    );
    vi.spyOn(pipeline, "markKnowledgeSourceIndexingError").mockRejectedValue(
      new FixtureIndexingError(),
    );

    const message = {
      body: { source_id: SOURCE_ID },
      attempts: INDEXING_QUEUE_MAX_RETRIES + 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    await handleIndexingQueueBatch(
      { messages: [message] } as unknown as MessageBatch<{ source_id: string }>,
      env,
    );

    const markLogs = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Indexing final error mark failed"),
    );
    expect(markLogs.length).toBeGreaterThan(0);
    assertNoLoggedErrorInstances(errorSpy.mock.calls);
    assertIndexingErrorLogsSafe(markLogs, { expectedNames: ["FixtureIndexingError"] });
  });

  it("logs only the error name when indexing a source fails in the pipeline", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const userId = "00000000-0000-4000-8000-000000000011";
    const connectionId = "00000000-0000-4000-8000-000000000021";

    const db = {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            return {
              first: async () => {
                if (sql.includes("FROM knowledge_sources")) {
                  return {
                    id: SOURCE_ID,
                    source_type: "github_repo",
                    external_ref: "owner/repo",
                    connection_id: connectionId,
                    indexing_run_id: null,
                    indexing_run_files_committed: null,
                    status: "pending",
                  };
                }
                if (sql.includes("FROM connections")) {
                  return {
                    id: connectionId,
                    user_id: userId,
                    provider: "github",
                    installation_id: "12345",
                  };
                }
                return null;
              },
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(
      pipeline.indexKnowledgeSource(
        db,
        {} as VectorizeIndex,
        config,
        { source_id: SOURCE_ID },
        {
          fetchGithubRepoDocuments: async () => {
            throw new FixtureIndexingError();
          },
        },
      ),
    ).rejects.toBeInstanceOf(FixtureIndexingError);

    const pipelineLogs = errorSpy.mock.calls.filter((call) => {
      const prefix = String(call[0]);
      return (
        prefix.includes("Indexing temporary failure") ||
        prefix.includes("Indexing permanent failure")
      );
    });
    expect(pipelineLogs.length).toBeGreaterThan(0);
    expect((pipelineLogs[0]?.[1] as { error: string }).error).toBe(
      "FixtureIndexingError",
    );
    assertNoLoggedErrorInstances(errorSpy.mock.calls);
    assertIndexingErrorLogsSafe(pipelineLogs, {
      expectedNames: ["FixtureIndexingError"],
    });
  });
});
