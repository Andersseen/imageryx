import type { ProcessingJob, ProcessingJobResult } from "@imageryx/contracts";
import { AssetActivityRepository, AssetRepository, ProcessingJobRepository } from "@imageryx/database";
import { assertValidProcessingJobTransition } from "@imageryx/image-core";
import type { ProcessingDeps } from "./deps";
import { classifyProcessingError, UnsupportedJobTypeError } from "./errors";
import { handleGenerateVariant } from "./handlers/generate-variant";
import { handleInspectMetadata } from "./handlers/inspect-metadata";

export type ProcessOutcome =
  | { outcome: "skipped"; reason: "not-found" | "already-completed" | "already-processing" }
  | { outcome: "completed" }
  | { outcome: "failed"; retryable: boolean; code: string };

function nowIso(): string {
  return new Date().toISOString();
}

async function dispatch(
  deps: ProcessingDeps,
  job: ProcessingJob,
): Promise<ProcessingJobResult> {
  switch (job.input.type) {
    case "inspect-metadata":
      return handleInspectMetadata(deps, job.input);
    case "generate-variant":
      return handleGenerateVariant(deps, job.input);
    case "extract-placeholder":
    case "strip-metadata":
    case "copy-provider-result":
    case "delete-object":
    case "batch-operation":
      throw new UnsupportedJobTypeError(
        `job type "${job.input.type}" is not implemented in Phase 3 — see context.md`,
      );
  }
}

/**
 * Loads one job by ID and runs it to completion or failure — the single
 * entry point shared by the real Queue consumer (`queue/consumer.ts`),
 * `api-worker`'s `PROCESSING_MODE=inline-local` fallback, and the backend
 * integration test, so all three ever have exactly one implementation of
 * "what happens when a processing job runs" (see context.md's "Local
 * Queue development" note — this is what "no duplicated backend flow"
 * means concretely).
 *
 * A job already `completed` or `processing` is skipped, not re-run — this
 * is what makes duplicate Queue delivery and manual retry safe. A job
 * found `failed` is treated as a redelivery/retry request and explicitly
 * walked back through `failed -> queued -> processing` before running
 * again (both are legal transitions on their own; see
 * `PROCESSING_JOB_STATUS_TRANSITIONS`).
 */
export async function processJob(
  deps: ProcessingDeps,
  jobId: string,
): Promise<ProcessOutcome> {
  const jobs = new ProcessingJobRepository(deps.db);
  const activity = new AssetActivityRepository(deps.db);

  const job = await jobs.findById(jobId);
  if (!job) {
    console.warn(JSON.stringify({ event: "processing.job.missing", jobId }));
    return { outcome: "skipped", reason: "not-found" };
  }
  if (job.status === "completed") {
    return { outcome: "skipped", reason: "already-completed" };
  }
  if (job.status === "processing") {
    return { outcome: "skipped", reason: "already-processing" };
  }

  if (job.status === "failed") {
    assertValidProcessingJobTransition("failed", "queued");
    await jobs.update(job.id, { status: "queued" });
  }

  assertValidProcessingJobTransition("queued", "processing");
  const attempts = job.attempts + 1;
  await jobs.update(job.id, {
    status: "processing",
    attempts,
    startedAt: nowIso(),
  });

  try {
    const result = await dispatch(deps, { ...job, attempts, status: "processing" });
    await jobs.update(job.id, {
      status: "completed",
      result,
      completedAt: nowIso(),
      errorCode: null,
      errorMessage: null,
    });
    return { outcome: "completed" };
  } catch (error) {
    const classified = classifyProcessingError(error);
    await jobs.update(job.id, {
      status: "failed",
      errorCode: classified.code,
      errorMessage: classified.message,
      failedAt: nowIso(),
    });

    if (job.assetId) {
      if (job.type === "inspect-metadata") {
        const assets = new AssetRepository(deps.db);
        await assets.update(job.assetId, { processingStatus: "failed" });
      }
      await activity.record({
        assetId: job.assetId,
        projectId: job.projectId,
        event: "processing.failed",
        metadata: { jobId: job.id, jobType: job.type, code: classified.code },
      });
    }

    const retryable = classified.retryable && attempts < deps.maxAttempts;
    return { outcome: "failed", retryable, code: classified.code };
  }
}

const INLINE_LOCAL_MAX_ITERATIONS = 10;

/**
 * `PROCESSING_MODE=inline-local` fallback: runs `processJob` to
 * completion, letting its own `failed -> queued` redelivery path drive
 * retries synchronously instead of relying on a real Queue redelivering
 * the message. Always called from inside `waitUntil`, never on the
 * request path — see README/ARCHITECTURE for the local fallback contract.
 */
export async function runJobUntilSettled(
  deps: ProcessingDeps,
  jobId: string,
): Promise<ProcessOutcome> {
  let outcome = await processJob(deps, jobId);
  let iterations = 1;
  while (
    outcome.outcome === "failed" &&
    outcome.retryable &&
    iterations < INLINE_LOCAL_MAX_ITERATIONS
  ) {
    outcome = await processJob(deps, jobId);
    iterations += 1;
  }
  return outcome;
}
