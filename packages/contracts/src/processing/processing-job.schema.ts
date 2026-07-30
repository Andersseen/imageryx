import { z } from "zod";
import {
  assetIdSchema,
  isoTimestampSchema,
  presetIdSchema,
  processingJobIdSchema,
  projectIdSchema,
  variantIdSchema,
} from "../common/identifiers";
import { metadataModeSchema } from "../presets/image-operation.schema";

export const PROCESSING_JOB_TYPES = [
  "inspect-metadata",
  "generate-variant",
  "extract-placeholder",
  "strip-metadata",
  "copy-provider-result",
  "delete-object",
  "batch-operation",
] as const;
export const processingJobTypeSchema = z.enum(PROCESSING_JOB_TYPES);
export type ProcessingJobType = z.infer<typeof processingJobTypeSchema>;

export const processingJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export type ProcessingJobStatus = z.infer<typeof processingJobStatusSchema>;

/**
 * Discriminated per job type instead of a single `Record<string, unknown>`
 * payload — every consumer (repository JSON-column read, processing-worker
 * dispatch) gets a typed, validated shape instead of trusting stored JSON.
 */
export const inspectMetadataInputSchema = z.object({
  type: z.literal("inspect-metadata"),
  assetId: assetIdSchema,
});

export const generateVariantInputSchema = z.object({
  type: z.literal("generate-variant"),
  assetId: assetIdSchema,
  presetId: presetIdSchema,
  presetHash: z.string().min(1),
});

export const extractPlaceholderInputSchema = z.object({
  type: z.literal("extract-placeholder"),
  assetId: assetIdSchema,
});

export const stripMetadataInputSchema = z.object({
  type: z.literal("strip-metadata"),
  assetId: assetIdSchema,
  mode: metadataModeSchema,
});

export const copyProviderResultInputSchema = z.object({
  type: z.literal("copy-provider-result"),
  assetId: assetIdSchema,
  variantId: variantIdSchema,
  sourceUrl: z.url(),
});

export const deleteObjectInputSchema = z.object({
  type: z.literal("delete-object"),
  storageKey: z.string().min(1),
});

export const batchOperationInputSchema = z.object({
  type: z.literal("batch-operation"),
  assetIds: z.array(assetIdSchema).min(1).max(500),
  presetId: presetIdSchema,
});

export const processingJobInputSchema = z.discriminatedUnion("type", [
  inspectMetadataInputSchema,
  generateVariantInputSchema,
  extractPlaceholderInputSchema,
  stripMetadataInputSchema,
  copyProviderResultInputSchema,
  deleteObjectInputSchema,
  batchOperationInputSchema,
]);
export type ProcessingJobInput = z.infer<typeof processingJobInputSchema>;

export const inspectMetadataResultSchema = z.object({
  type: z.literal("inspect-metadata"),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  hasAlpha: z.boolean().nullable(),
  dominantColor: z.string().nullable(),
});

export const generateVariantResultSchema = z.object({
  type: z.literal("generate-variant"),
  variantId: variantIdSchema,
  storageKey: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
});

export const extractPlaceholderResultSchema = z.object({
  type: z.literal("extract-placeholder"),
  placeholder: z.string(),
});

export const stripMetadataResultSchema = z.object({
  type: z.literal("strip-metadata"),
  storageKey: z.string(),
});

export const copyProviderResultResultSchema = z.object({
  type: z.literal("copy-provider-result"),
  storageKey: z.string(),
});

export const deleteObjectResultSchema = z.object({
  type: z.literal("delete-object"),
  deleted: z.boolean(),
});

export const batchOperationResultSchema = z.object({
  type: z.literal("batch-operation"),
  processedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

export const processingJobResultSchema = z.discriminatedUnion("type", [
  inspectMetadataResultSchema,
  generateVariantResultSchema,
  extractPlaceholderResultSchema,
  stripMetadataResultSchema,
  copyProviderResultResultSchema,
  deleteObjectResultSchema,
  batchOperationResultSchema,
]);
export type ProcessingJobResult = z.infer<typeof processingJobResultSchema>;

export const processingJobSchema = z.object({
  id: processingJobIdSchema,
  projectId: projectIdSchema,
  assetId: assetIdSchema.nullable(),
  type: processingJobTypeSchema,
  provider: z.string().nullable(),
  status: processingJobStatusSchema,
  input: processingJobInputSchema,
  result: processingJobResultSchema.nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: isoTimestampSchema,
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  failedAt: isoTimestampSchema.nullable(),
});
export type ProcessingJob = z.infer<typeof processingJobSchema>;

/** Valid status transitions, shared by the repository layer and image-core's transition validator. */
export const PROCESSING_JOB_STATUS_TRANSITIONS: Readonly<
  Record<ProcessingJobStatus, readonly ProcessingJobStatus[]>
> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};
