import { runJobUntilSettled } from "@imageryx/processing-worker/jobs";
import { buildProcessingDeps } from "@imageryx/processing-worker/jobs/deps";
import { isInlineLocalProcessing } from "./env";

export type DispatchMode = "queue" | "inline-local";

export interface DispatchResult {
  mode: DispatchMode;
  /** `false` only for `mode: "queue"` — publishing failed, but the job row was already persisted as `queued` and remains retryable via `POST /v1/processing-jobs/:jobId/retry`. */
  dispatched: boolean;
}

/**
 * Publishes a job for asynchronous processing. `queue` mode awaits a
 * lightweight `env.PROCESSING_QUEUE.send()` (not "expensive processing" —
 * enqueuing a message, not running one) so a publish failure can be
 * detected and reported in the same response. `inline-local` mode (see
 * `PROCESSING_MODE` in .env.example) instead runs the exact same
 * `processJob`/`runJobUntilSettled` function the real Queue consumer
 * uses, inside `waitUntil` so the actual job work never blocks the HTTP
 * response — see context.md's "Local Queue development" note for why
 * this exists and why it does not duplicate any business logic.
 */
export async function dispatchProcessingJob(
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  jobId: string,
): Promise<DispatchResult> {
  if (isInlineLocalProcessing(env)) {
    const deps = buildProcessingDeps(env);
    waitUntil(
      runJobUntilSettled(deps, jobId).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            event: "processing.inline_local.unhandled_error",
            jobId,
            error: error instanceof Error ? error.message : "unknown error",
          }),
        );
      }),
    );
    return { mode: "inline-local", dispatched: true };
  }

  try {
    await env.PROCESSING_QUEUE.send({ jobId });
    return { mode: "queue", dispatched: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "processing.queue_publish_failed",
        jobId,
        error: error instanceof Error ? error.message : "unknown error",
      }),
    );
    return { mode: "queue", dispatched: false };
  }
}
