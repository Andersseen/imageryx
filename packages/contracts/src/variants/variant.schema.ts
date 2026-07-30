import { z } from "zod";
import {
  assetIdSchema,
  checksumSchema,
  isoTimestampSchema,
  presetIdSchema,
  variantIdSchema,
} from "../common/identifiers";
import { transformationProviderNameSchema } from "../providers/provider.schema";

export const variantStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);
export type VariantStatus = z.infer<typeof variantStatusSchema>;

export const variantSchema = z.object({
  id: variantIdSchema,
  assetId: assetIdSchema,
  presetId: presetIdSchema,
  presetHash: z.string().min(1),
  provider: transformationProviderNameSchema,
  storageKey: z.string().nullable(),
  deliveryUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  checksum: checksumSchema.nullable(),
  status: variantStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ImageVariant = z.infer<typeof variantSchema>;

/** Valid status transitions, shared by the repository layer and image-core's transition validator. */
export const VARIANT_STATUS_TRANSITIONS: Readonly<
  Record<VariantStatus, readonly VariantStatus[]>
> = {
  pending: ["processing", "failed"],
  processing: ["ready", "failed"],
  ready: [],
  failed: ["pending"],
};
