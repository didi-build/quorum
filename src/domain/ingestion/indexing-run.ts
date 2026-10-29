import type { IndexingQueueMessage } from "./indexing-message.js";

export interface KnowledgeSourceRunRow {
  indexing_run_id: string | null;
  status: string;
}

export function resolveIndexingRun(
  message: IndexingQueueMessage,
  source: KnowledgeSourceRunRow,
  isFreshRun: boolean,
): { stale: boolean; runId: string | null } {
  const msgRun = message.indexing_run_id ?? null;
  const srcRun = source.indexing_run_id ?? null;

  if (!isFreshRun) {
    if (msgRun === null || srcRun === null || msgRun !== srcRun) {
      return { stale: true, runId: null };
    }
    return { stale: false, runId: srcRun };
  }

  if (msgRun !== null && srcRun !== null && msgRun !== srcRun) {
    return { stale: true, runId: null };
  }

  if (source.status !== "indexing") {
    const runId = msgRun ?? crypto.randomUUID();
    return { stale: false, runId };
  }

  if (msgRun !== null) {
    if (srcRun !== null && msgRun !== srcRun) {
      return { stale: true, runId: null };
    }
    return { stale: false, runId: msgRun ?? srcRun };
  }

  if (srcRun === null) {
    return { stale: false, runId: crypto.randomUUID() };
  }

  return { stale: false, runId: srcRun };
}

export function withIndexingRunId(
  message: IndexingQueueMessage,
  runId: string,
): IndexingQueueMessage {
  return {
    ...message,
    indexing_run_id: runId,
  };
}
