import { loadConfig } from "../config/load-config.js";
import type { Env } from "../env.js";
import type { IndexingQueueMessage } from "../domain/ingestion/indexing-message.js";
import { indexKnowledgeSource } from "../domain/ingestion/pipeline.js";

export async function handleIndexingQueueBatch(
  batch: MessageBatch<IndexingQueueMessage>,
  env: Env,
): Promise<void> {
  const config = loadConfig(env);

  for (const message of batch.messages) {
    try {
      const result = await indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        message.body,
      );
      if (result.continuation !== null) {
        await env.INDEXING_QUEUE.send(result.continuation);
      }
      message.ack();
    } catch (error) {
      console.error("Indexing queue message failed", error);
      message.retry();
    }
  }
}
