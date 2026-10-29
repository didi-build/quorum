import { loadConfig } from "../config/load-config.js";
import type { QuorumConfig } from "../config/types.js";
import type { Env } from "../env.js";
import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../domain/ingestion/errors.js";
import type { IndexingQueueMessage } from "../domain/ingestion/indexing-message.js";
import {
  indexingErrorLogFields,
  isIndexingTemporaryError,
} from "../domain/ingestion/indexing-retry.js";
import {
  indexKnowledgeSource,
  markKnowledgeSourceIndexingError,
} from "../domain/ingestion/pipeline.js";
import { isFinalIndexingQueueAttempt } from "./indexing-queue-constants.js";

async function markFinalIndexingError(
  db: D1Database,
  message: IndexingQueueMessage,
): Promise<void> {
  try {
    await markKnowledgeSourceIndexingError(
      db,
      message.source_id,
      GENERIC_INDEXING_FAILURE_MESSAGE,
      message.indexing_run_id ?? null,
    );
  } catch (error) {
    console.error("Indexing final error mark failed", {
      source_id: message.source_id,
      ...indexingErrorLogFields(error),
    });
  }
}

async function handleMessageFailure(
  message: Message<IndexingQueueMessage>,
  env: Env,
  error: unknown,
): Promise<void> {
  console.error("Indexing queue message failed", {
    source_id: message.body.source_id,
    attempt: message.attempts,
    ...indexingErrorLogFields(error),
  });

  if (isFinalIndexingQueueAttempt(message.attempts)) {
    await markFinalIndexingError(env.DB, message.body);
    message.ack();
  } else {
    message.retry();
  }
}

export async function handleIndexingQueueBatch(
  batch: MessageBatch<IndexingQueueMessage>,
  env: Env,
): Promise<void> {
  let config: QuorumConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    for (const message of batch.messages) {
      await handleMessageFailure(message, env, error);
    }
    return;
  }

  for (const message of batch.messages) {
    try {
      const result = await indexKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        config,
        message.body,
        {},
        { queueAttempt: message.attempts },
      );
      if (result.stale) {
        message.ack();
        continue;
      }
      if (result.continuation !== null) {
        try {
          await env.INDEXING_QUEUE.send(result.continuation);
        } catch (error) {
          await handleMessageFailure(message, env, error);
          continue;
        }
      }
      message.ack();
    } catch (error) {
      if (!isIndexingTemporaryError(error)) {
        console.error("Indexing queue unexpected failure", {
          source_id: message.body.source_id,
          attempt: message.attempts,
          ...indexingErrorLogFields(error),
        });
        await markFinalIndexingError(env.DB, message.body);
        message.ack();
        continue;
      }
      await handleMessageFailure(message, env, error);
    }
  }
}
