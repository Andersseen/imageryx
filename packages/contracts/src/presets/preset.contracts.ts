import { z } from "zod";
import { presetIdSchema, projectIdSchema } from "../common/identifiers";
import { paginationInputSchema } from "../common/pagination";
import { outputImageFormatSchema } from "./image-operation.schema";
import {
  presetDescriptionSchema,
  presetNameSchema,
  presetOperationsSchema,
  presetQualitySchema,
  presetSlugSchema,
} from "./preset.schema";

export const createPresetInputSchema = z.object({
  projectId: projectIdSchema,
  name: presetNameSchema,
  slug: presetSlugSchema.optional(),
  description: presetDescriptionSchema.optional(),
  operations: presetOperationsSchema,
  outputFormat: outputImageFormatSchema.default("auto"),
  quality: presetQualitySchema.optional(),
});
export type CreatePresetInput = z.infer<typeof createPresetInputSchema>;

export const updatePresetInputSchema = z
  .object({
    id: presetIdSchema,
    name: presetNameSchema.optional(),
    description: presetDescriptionSchema.optional(),
    operations: presetOperationsSchema.optional(),
    outputFormat: outputImageFormatSchema.optional(),
    quality: presetQualitySchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.operations !== undefined ||
      value.outputFormat !== undefined ||
      value.quality !== undefined,
    { message: "at least one updatable field must be provided" },
  );
export type UpdatePresetInput = z.infer<typeof updatePresetInputSchema>;

export const getPresetInputSchema = z.object({ id: presetIdSchema });
export type GetPresetInput = z.infer<typeof getPresetInputSchema>;

export const listPresetsInputSchema = paginationInputSchema.extend({
  projectId: projectIdSchema,
});
export type ListPresetsInput = z.infer<typeof listPresetsInputSchema>;

/** System presets may be read but never deleted — enforced by the repository, not just this schema. */
export const deletePresetInputSchema = z.object({ id: presetIdSchema });
export type DeletePresetInput = z.infer<typeof deletePresetInputSchema>;
