import { isPlaceholderProcessingJob } from "../jobs/placeholder-job";

/**
 * Acknowledges known-safe placeholder jobs and structured-logs the
 * outcome. Anything that isn't a recognized placeholder job is retried
 * rather than silently dropped, since real job kinds don't exist yet and
 * an unrecognized message likely means a producer/consumer version skew.
 */
export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    if (!isPlaceholderProcessingJob(message.body)) {
      console.error(
        JSON.stringify({
          event: "processing.job.invalid",
          messageId: message.id,
          timestamp: new Date().toISOString(),
        }),
      );
      message.retry();
      continue;
    }

    console.log(
      JSON.stringify({
        event: "processing.job.acknowledged",
        jobId: message.body.jobId,
        kind: message.body.kind,
        timestamp: new Date().toISOString(),
      }),
    );
    message.ack();
  }
}
