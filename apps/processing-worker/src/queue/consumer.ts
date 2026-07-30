import { buildProcessingDeps } from "../lib/env";
import { processJob } from "../jobs/process-job";

export interface ProcessingQueueMessage {
  jobId: string;
}

function isProcessingQueueMessage(value: unknown): value is ProcessingQueueMessage {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body["jobId"] === "string" && body["jobId"].length > 0;
}

/**
 * Every message carries only a job ID (see `ProcessingQueueMessage`) —
 * never a complete image payload or a secret — so `processJob` always
 * re-reads the authoritative job row from D1 before doing any work.
 */
export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const deps = buildProcessingDeps(env);

  for (const message of batch.messages) {
    if (!isProcessingQueueMessage(message.body)) {
      console.error(
        JSON.stringify({
          event: "processing.queue.invalid_message",
          messageId: message.id,
          timestamp: new Date().toISOString(),
        }),
      );
      message.retry();
      continue;
    }

    const jobId = message.body.jobId;
    const start = Date.now();

    try {
      const outcome = await processJob(deps, jobId);
      console.log(
        JSON.stringify({
          event: "processing.queue.processed",
          jobId,
          outcome: outcome.outcome,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        }),
      );

      if (outcome.outcome === "failed" && outcome.retryable) {
        message.retry();
      } else {
        message.ack();
      }
    } catch (error) {
      // processJob is designed not to throw (every code path returns an outcome) — an escape
      // here means an unexpected bug, not a classified processing failure. Retry rather than
      // silently drop, and never forward the raw error text past this log line.
      console.error(
        JSON.stringify({
          event: "processing.queue.unhandled_error",
          jobId,
          error: error instanceof Error ? error.message : "unknown error",
          timestamp: new Date().toISOString(),
        }),
      );
      message.retry();
    }
  }
}
