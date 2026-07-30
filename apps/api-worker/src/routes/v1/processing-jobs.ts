import type { ProcessingJobStatus, ProcessingJobType } from "@imageryx/contracts";
import { AssetActivityRepository, ProcessingJobRepository } from "@imageryx/database";
import { Hono } from "hono";
import { dispatchProcessingJob } from "../../lib/dispatch-processing";
import { ConflictError, NotFoundError, ValidationHttpError } from "../../lib/errors";
import { buildPaginatedResponse } from "../../lib/pagination";
import { param } from "../../lib/params";
import type { RequestIdVariables } from "../../middleware/request-id";

export const processingJobsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

const SUPPORTED_TYPES = new Set<string>([
  "inspect-metadata",
  "generate-variant",
  "extract-placeholder",
  "strip-metadata",
  "copy-provider-result",
  "delete-object",
  "batch-operation",
]);
const SUPPORTED_STATUSES = new Set<string>([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

processingJobsRoute.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) throw new ValidationHttpError("projectId is a required query parameter.");

  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "24") || 24));
  const assetId = c.req.query("assetId") || undefined;
  const typeRaw = c.req.query("type");
  const type = typeRaw && SUPPORTED_TYPES.has(typeRaw) ? (typeRaw as ProcessingJobType) : undefined;
  const statusRaw = c.req.query("status");
  const status =
    statusRaw && SUPPORTED_STATUSES.has(statusRaw) ? (statusRaw as ProcessingJobStatus) : undefined;

  const jobs = new ProcessingJobRepository(c.env.DB);
  const all = await jobs.list({ projectId, assetId, type, status });
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);

  return c.json(buildPaginatedResponse(items, page, pageSize, all.length));
});

processingJobsRoute.get("/:jobId", async (c) => {
  const job = await new ProcessingJobRepository(c.env.DB).findById(param(c, "jobId"));
  if (!job) throw new NotFoundError("processing_job");
  return c.json(job);
});

processingJobsRoute.post("/:jobId/retry", async (c) => {
  const jobId = param(c, "jobId");
  const jobs = new ProcessingJobRepository(c.env.DB);
  const job = await jobs.findById(jobId);
  if (!job) throw new NotFoundError("processing_job");
  if (job.status !== "failed") {
    throw new ConflictError(
      "job_not_retryable",
      `Only failed jobs can be retried (current status: "${job.status}").`,
    );
  }

  const updated = await jobs.update(jobId, {
    status: "queued",
    errorCode: null,
    errorMessage: null,
    failedAt: null,
  });

  await dispatchProcessingJob(c.env, c.executionCtx.waitUntil.bind(c.executionCtx), jobId);

  if (job.assetId) {
    await new AssetActivityRepository(c.env.DB).record({
      assetId: job.assetId,
      projectId: job.projectId,
      event: "processing.retried",
      metadata: { jobId },
    });
  }

  return c.json(updated);
});

processingJobsRoute.post("/:jobId/cancel", async (c) => {
  const jobId = param(c, "jobId");
  const jobs = new ProcessingJobRepository(c.env.DB);
  const job = await jobs.findById(jobId);
  if (!job) throw new NotFoundError("processing_job");
  if (job.status !== "queued") {
    throw new ConflictError(
      "job_not_cancellable",
      `Only queued jobs can be cancelled (current status: "${job.status}"). A currently-running job cannot be safely cancelled mid-flight.`,
    );
  }

  const updated = await jobs.update(jobId, { status: "cancelled" });
  return c.json(updated);
});
