import { describe, expect, it } from "vitest";
import { resolveIndexingRun } from "../src/domain/ingestion/indexing-run.js";

describe("resolveIndexingRun", () => {
  it("starts a new run id when indexing has not started yet", () => {
    const result = resolveIndexingRun(
      { source_id: "s1" },
      { indexing_run_id: null, indexing_run_files_committed: null, status: "pending" },
      true,
    );
    expect(result.stale).toBe(false);
    expect(result.mustClaimRun).toBe(true);
    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("uses the source run id when a continuation omits run id", () => {
    const runId = "00000000-0000-4000-8000-000000000008";
    const result = resolveIndexingRun(
      { source_id: "s1", github_files_processed: 10 },
      {
        indexing_run_id: runId,
        indexing_run_files_committed: 10,
        status: "indexing",
      },
      false,
    );
    expect(result).toEqual({ stale: false, runId, mustClaimRun: false });
  });

  it("adopts a continuation with no run id when the source run id is still null", () => {
    const result = resolveIndexingRun(
      { source_id: "s1", github_files_processed: 10 },
      {
        indexing_run_id: null,
        indexing_run_files_committed: null,
        status: "indexing",
      },
      false,
    );
    expect(result.stale).toBe(false);
    expect(result.mustClaimRun).toBe(true);
    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("drops continuation with run id when the source is no longer indexing", () => {
    const runId = "00000000-0000-4000-8000-000000000009";
    const result = resolveIndexingRun(
      {
        source_id: "s1",
        indexing_run_id: runId,
        github_files_processed: 10,
      },
      {
        indexing_run_id: null,
        indexing_run_files_committed: null,
        status: "error",
      },
      false,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });

  it("claims message run id on continuation when indexing with null source run id", () => {
    const runId = "00000000-0000-4000-8000-000000000010";
    const result = resolveIndexingRun(
      {
        source_id: "s1",
        indexing_run_id: runId,
        github_files_processed: 10,
      },
      {
        indexing_run_id: null,
        indexing_run_files_committed: null,
        status: "indexing",
      },
      false,
    );
    expect(result).toEqual({ stale: false, runId, mustClaimRun: true });
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
        indexing_run_files_committed: null,
        status: "indexing",
      },
      false,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });

  it("allows a first-leg retry while indexing with no committed progress", () => {
    const runId = "00000000-0000-4000-8000-000000000003";
    const result = resolveIndexingRun(
      { source_id: "s1" },
      {
        indexing_run_id: runId,
        indexing_run_files_committed: 0,
        status: "indexing",
      },
      true,
    );
    expect(result).toEqual({ stale: false, runId, mustClaimRun: false });
  });

  it("drops a late first message after run progress was committed", () => {
    const runId = "00000000-0000-4000-8000-000000000004";
    const result = resolveIndexingRun(
      { source_id: "s1" },
      {
        indexing_run_id: runId,
        indexing_run_files_committed: 50,
        status: "indexing",
      },
      true,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });

  it("drops a late first message after the source is ready again", () => {
    const result = resolveIndexingRun(
      { source_id: "s1" },
      {
        indexing_run_id: "00000000-0000-4000-8000-000000000005",
        indexing_run_files_committed: 0,
        status: "ready",
      },
      true,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });

  it("drops a fresh message whose run id does not match a ready source", () => {
    const result = resolveIndexingRun(
      {
        source_id: "s1",
        indexing_run_id: "00000000-0000-4000-8000-000000000006",
      },
      {
        indexing_run_id: "00000000-0000-4000-8000-000000000007",
        indexing_run_files_committed: null,
        status: "ready",
      },
      true,
    );
    expect(result).toEqual({ stale: true, runId: null, mustClaimRun: false });
  });
});
