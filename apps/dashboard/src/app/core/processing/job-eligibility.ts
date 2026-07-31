import type { ProcessingJobStatus } from "@imageryx/contracts";

/**
 * Mirrors `PROCESSING_JOB_STATUS_TRANSITIONS` in `@imageryx/contracts` exactly: retry is only
 * ever legal from `failed`, cancel only from `queued`. This is a *UI* mirror for deciding which
 * button to show — the API re-checks the same rule server-side and is the actual authority
 * (`POST /v1/processing-jobs/:id/retry|cancel` both 409 otherwise), so showing the wrong button
 * here can never let an illegal transition through, only offer a control that isn't there.
 */
export function isRetryable(status: ProcessingJobStatus): boolean {
  return status === "failed";
}

export function isCancellable(status: ProcessingJobStatus): boolean {
  return status === "queued";
}

export function isTerminal(status: ProcessingJobStatus): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}
