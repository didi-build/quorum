import type { IndexingQueueMessage } from "../ingestion/indexing-message.js";

export async function enqueueKnowledgeSourceIndexing(
  queue: Queue<IndexingQueueMessage>,
  sourceId: string,
  indexingRunId?: string,
): Promise<void> {
  const message: IndexingQueueMessage =
    indexingRunId !== undefined
      ? { source_id: sourceId, indexing_run_id: indexingRunId }
      : { source_id: sourceId };
  await queue.send(message);
}
