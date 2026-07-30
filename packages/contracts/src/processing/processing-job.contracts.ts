import { z } from "zod";
import {
  assetIdSchema,
  processingJobIdSchema,
  projectIdSchema,
} from "../common/identifiers";
import { paginationInputSchema } from "../common/pagination";
import {
  processingJobInputSchema,
  processingJobStatusSchema,
  processingJobTypeSchema,
} from "./processing-job.schema";

export const createProcessingJobInputSchema = z.object({
  projectId: projectIdSchema,
  assetId: assetIdSchema.nullable().optional(),
  input: processingJobInputSchema,
});
export type CreateProcessingJobInput = z.infer<
  typeof createProcessingJobInputSchema
>;

export const getProcessingJobInputSchema = z.object({
  id: processingJobIdSchema,
});
export type GetProcessingJobInput = z.infer<typeof getProcessingJobInputSchema>;

export const listProcessingJobsInputSchema = paginationInputSchema.extend({
  projectId: projectIdSchema,
  assetId: assetIdSchema.optional(),
  type: processingJobTypeSchema.optional(),
  status: processingJobStatusSchema.optional(),
});
export type ListProcessingJobsInput = z.infer<
  typeof listProcessingJobsInputSchema
>;
