import type { IndexingQueueMessage } from "../ingestion/indexing-message.js";

export async function enqueueKnowledgeSourceIndexing(
  queue: Queue<IndexingQueueMessage>,
  sourceId: string,
): Promise<void> {
  await queue.send({ source_id: sourceId });
}
