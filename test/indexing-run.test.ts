import { describe, expect, it } from "vitest";
import { resolveIndexingRun } from "../src/domain/ingestion/indexing-run.js";

describe("resolveIndexingRun", () => {
  it("starts a new run id when indexing has not started yet", () => {
    const result = resolveIndexingRun(
      { source_id: "s1" },
      { indexing_run_id: null, status: "pending" },
      true,
    );
    expect(result.stale).toBe(false);
    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("drops continuation messages with a stale run id", () => {
    const result = resolveIndexingRun(
      {
        source_id: "s1",
        indexing_run_id: "00000000-0000-4000-8000-000000000001",
        github_files_processed: 10,
      },
      {
        indexing_run_id: "00000000-0000-4000-8000-000000000002",
        status: "indexing",
      },
      false,
    );
    expect(result).toEqual({ stale: true, runId: null });
  });

  it("reuses the source run id for a fresh retry while indexing", () => {
    const runId = "00000000-0000-4000-8000-000000000003";
    const result = resolveIndexingRun(
      { source_id: "s1" },
      { indexing_run_id: runId, status: "indexing" },
      true,
    );
    expect(result).toEqual({ stale: false, runId });
  });
});
