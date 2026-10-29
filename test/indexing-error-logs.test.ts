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
      "api_key=REDACTED fixture token=fixture-token query=https://example.test?q=1 body=secret-content",
    );
    this.name = "FixtureIndexingError";
  }
}

const forbiddenLogSubstrings = [
  "api_key=REDACTED",
  "fixture-token",
  "https://example.test?q=1",
  "secret-content",
];

function expectLogsOnlyErrorName(calls: unknown[][], expectedName: string): void {
  const serialized = JSON.stringify(calls);
  expect(serialized).toContain(expectedName);
  for (const fragment of forbiddenLogSubstrings) {
    expect(serialized).not.toContain(fragment);
  }
  for (const call of calls) {
    for (const arg of call) {
      if (arg instanceof Error) {
        expect(arg.message).toContain("api_key");
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

    expectLogsOnlyErrorName(errorSpy.mock.calls, "FixtureIndexingError");
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

    expectLogsOnlyErrorName(errorSpy.mock.calls, "ConfigError");
  });

  it("logs only the error name when indexing a source fails in the pipeline", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const userId = "00000000-0000-4000-8000-000000000011";
    const connectionId = "00000000-0000-4000-8000-000000000021";

    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              first: async () => {
                statements.push({ sql, args });
                if (sql.includes("FROM knowledge_sources")) {
                  return {
                    id: SOURCE_ID,
                    source_type: "github_repo",
                    external_ref: "owner/repo",
                    connection_id: connectionId,
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
              run: async () => ({}),
            };
          },
        };
      },
    } as unknown as D1Database;

    await pipeline.indexKnowledgeSource(
      db,
      {} as VectorizeIndex,
      config,
      { source_id: SOURCE_ID },
      {
        fetchGithubRepoDocuments: async () => {
          throw new FixtureIndexingError();
        },
      },
    );

    const pipelineLogs = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Indexing failed for source"),
    );
    expect(pipelineLogs.length).toBeGreaterThan(0);
    expect(String(pipelineLogs[0]?.[2])).toBe("FixtureIndexingError");
    expectLogsOnlyErrorName(pipelineLogs, "FixtureIndexingError");
  });
});
