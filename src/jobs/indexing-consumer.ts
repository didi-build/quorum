import { loadConfig } from "../config/load-config.js";
import type { Env } from "../env.js";
import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../domain/ingestion/errors.js";
import type { IndexingQueueMessage } from "../domain/ingestion/indexing-message.js";
import {
  indexKnowledgeSource,
  markKnowledgeSourceIndexingError,
} from "../domain/ingestion/pipeline.js";
import { isFinalIndexingQueueAttempt } from "./indexing-queue-constants.js";

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
      const errorName = error instanceof Error ? error.name : "unknown_error";
      console.error("Indexing queue message failed", {
        source_id: message.body.source_id,
        attempt: message.attempts,
        error: errorName,
      });

      if (isFinalIndexingQueueAttempt(message.attempts)) {
        await markKnowledgeSourceIndexingError(
          env.DB,
          message.body.source_id,
          GENERIC_INDEXING_FAILURE_MESSAGE,
        );
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
