import { z } from "zod";
import {
  assetIdSchema,
  checksumSchema,
  folderIdSchema,
  isoTimestampSchema,
  projectIdSchema,
  supportedImageExtensionSchema,
  supportedImageMimeTypeSchema,
} from "../common/identifiers";
import { assetFilterSchema } from "./asset-filter.schema";
import {
  MAX_TAGS_PER_ASSET,
  ORIGINAL_FILENAME_MAX_LENGTH,
  assetNameSchema,
  assetSchema,
  assetVisibilitySchema,
  tagSchema,
} from "./asset.schema";

/**
 * The caller (an already-completed local/R2 storage write) reports what it
 * wrote; this endpoint records metadata, it does not receive raw bytes —
 * that keeps the multipart upload path out of scope for Phase 2 per the
 * phase's restrictions.
 */
export const registerAssetInputSchema = z.object({
  projectId: projectIdSchema,
  folderId: folderIdSchema.nullable().optional(),
  originalFilename: z.string().min(1).max(ORIGINAL_FILENAME_MAX_LENGTH),
  mimeType: supportedImageMimeTypeSchema,
  extension: supportedImageExtensionSchema,
  sizeBytes: z.number().int().positive(),
  checksum: checksumSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  visibility: assetVisibilitySchema.default("private"),
});
export type RegisterAssetInput = z.infer<typeof registerAssetInputSchema>;

export const updateAssetMetadataInputSchema = z
  .object({
    id: assetIdSchema,
    name: assetNameSchema.optional(),
    downloadOriginalEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.downloadOriginalEnabled !== undefined,
    {
      message: "at least one updatable field must be provided",
    },
  );
export type UpdateAssetMetadataInput = z.infer<
  typeof updateAssetMetadataInputSchema
>;

export const moveAssetInputSchema = z.object({
  id: assetIdSchema,
  folderId: folderIdSchema.nullable(),
});
export type MoveAssetInput = z.infer<typeof moveAssetInputSchema>;

export const changeAssetVisibilityInputSchema = z.object({
  id: assetIdSchema,
  visibility: assetVisibilitySchema,
});
export type ChangeAssetVisibilityInput = z.infer<
  typeof changeAssetVisibilityInputSchema
>;

export const changeAssetTagsInputSchema = z.object({
  id: assetIdSchema,
  tags: z.array(tagSchema).max(MAX_TAGS_PER_ASSET),
});
export type ChangeAssetTagsInput = z.infer<typeof changeAssetTagsInputSchema>;

export const softDeleteAssetInputSchema = z.object({ id: assetIdSchema });
export type SoftDeleteAssetInput = z.infer<typeof softDeleteAssetInputSchema>;

export const restoreAssetInputSchema = z.object({ id: assetIdSchema });
export type RestoreAssetInput = z.infer<typeof restoreAssetInputSchema>;

export const getAssetInputSchema = z.object({ id: assetIdSchema });
export type GetAssetInput = z.infer<typeof getAssetInputSchema>;

export const listAssetsInputSchema = assetFilterSchema;
export type ListAssetsInput = z.infer<typeof listAssetsInputSchema>;

export const assetDetailsResponseSchema = assetSchema.extend({
  tags: z.array(tagSchema),
});
export type AssetDetailsResponse = z.infer<typeof assetDetailsResponseSchema>;

export const duplicateCandidateSchema = z.object({
  assetId: assetIdSchema,
  path: z.string(),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const downloadUrlVariantSchema = z.union([
  z.literal("original"),
  z.string().min(1),
]);

export const createDownloadUrlInputSchema = z.object({
  id: assetIdSchema,
  variant: downloadUrlVariantSchema.default("original"),
  expiresIn: z.number().int().min(60).max(86400).default(900),
});
export type CreateDownloadUrlInput = z.infer<typeof createDownloadUrlInputSchema>;

export const createDownloadUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: isoTimestampSchema,
  variant: downloadUrlVariantSchema,
});
export type CreateDownloadUrlResponse = z.infer<
  typeof createDownloadUrlResponseSchema
>;
