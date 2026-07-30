import { z } from "zod";
import {
  isoTimestampSchema,
  presetIdSchema,
  projectIdSchema,
  slugSchema,
} from "../common/identifiers";
import {
  imageOperationSchema,
  outputImageFormatSchema,
} from "./image-operation.schema";

export const PRESET_NAME_MAX_LENGTH = 120;
export const PRESET_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Maximum operation-chain length lives here as a shape constraint (array
 * length). Semantic rules that need to inspect the operations together —
 * duplicate/conflicting operations, at most one format/quality op,
 * deterministic normalization and hashing — require real algorithms and
 * live in `@imageryx/image-core` (`validatePresetSemantics`, `hashPreset`),
 * not in this schema-only package.
 */
export const MAX_OPERATIONS_PER_PRESET = 12;

export const presetOperationsSchema = z
  .array(imageOperationSchema)
  .max(
    MAX_OPERATIONS_PER_PRESET,
    `a preset may not define more than ${MAX_OPERATIONS_PER_PRESET} operations`,
  );

export const presetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRESET_NAME_MAX_LENGTH);
export const presetSlugSchema = slugSchema;
export const presetDescriptionSchema = z
  .string()
  .trim()
  .max(PRESET_DESCRIPTION_MAX_LENGTH)
  .nullable();
export const presetQualitySchema = z.number().int().min(1).max(100).nullable();

export const presetSchema = z.object({
  id: presetIdSchema,
  projectId: projectIdSchema,
  name: presetNameSchema,
  slug: presetSlugSchema,
  description: presetDescriptionSchema,
  operations: presetOperationsSchema,
  outputFormat: outputImageFormatSchema,
  quality: presetQualitySchema,
  isSystem: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ImagePreset = z.infer<typeof presetSchema>;
