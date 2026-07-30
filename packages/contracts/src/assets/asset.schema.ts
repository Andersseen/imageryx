import { z } from "zod";
import {
  assetIdSchema,
  checksumSchema,
  folderIdSchema,
  isoTimestampSchema,
  logicalPathSchema,
  projectIdSchema,
  slugSchema,
  supportedImageExtensionSchema,
  supportedImageMimeTypeSchema,
} from "../common/identifiers";

export const ASSET_NAME_MAX_LENGTH = 180;
export const ORIGINAL_FILENAME_MAX_LENGTH = 255;
export const STORAGE_KEY_MAX_LENGTH = 512;
export const TAG_MAX_LENGTH = 60;
export const MAX_TAGS_PER_ASSET = 50;

export const assetVisibilitySchema = z.enum(["public", "private"]);
export type AssetVisibility = z.infer<typeof assetVisibilitySchema>;

export const processingStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const dominantColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable();

export const assetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSET_NAME_MAX_LENGTH);
export const assetSlugSchema = slugSchema;
export const tagSchema = z.string().trim().min(1).max(TAG_MAX_LENGTH);

export const assetSchema = z.object({
  id: assetIdSchema,
  projectId: projectIdSchema,
  folderId: folderIdSchema.nullable(),
  name: assetNameSchema,
  slug: assetSlugSchema,
  path: logicalPathSchema,
  storageKey: z.string().min(1).max(STORAGE_KEY_MAX_LENGTH),
  originalFilename: z.string().min(1).max(ORIGINAL_FILENAME_MAX_LENGTH),
  mimeType: supportedImageMimeTypeSchema,
  extension: supportedImageExtensionSchema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  aspectRatio: z.number().positive().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: checksumSchema,
  hasAlpha: z.boolean().nullable(),
  dominantColor: dominantColorSchema,
  placeholder: z.string().nullable(),
  visibility: assetVisibilitySchema,
  processingStatus: processingStatusSchema,
  downloadOriginalEnabled: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  deletedAt: isoTimestampSchema.nullable(),
});
export type ImageAsset = z.infer<typeof assetSchema>;
