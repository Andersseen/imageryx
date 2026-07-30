import { z } from "zod";
import {
  folderIdSchema,
  isoTimestampSchema,
  projectIdSchema,
  supportedImageExtensionSchema,
  supportedImageMimeTypeSchema,
} from "../common/identifiers";
import { paginationInputSchema } from "../common/pagination";
import { sortDirectionSchema } from "../common/sorting";
import { assetVisibilitySchema, processingStatusSchema } from "./asset.schema";

export const assetSortFieldSchema = z.enum([
  "createdAt",
  "updatedAt",
  "name",
  "sizeBytes",
]);
export type AssetSortField = z.infer<typeof assetSortFieldSchema>;

export const deletedStateSchema = z.enum(["active", "deleted", "all"]);
export type DeletedState = z.infer<typeof deletedStateSchema>;

export const assetFilterSchema = paginationInputSchema
  .extend({
    projectId: projectIdSchema,
    folderId: folderIdSchema.nullable().optional(),
    tag: z.string().trim().min(1).optional(),
    mimeType: supportedImageMimeTypeSchema.optional(),
    extension: supportedImageExtensionSchema.optional(),
    visibility: assetVisibilitySchema.optional(),
    processingStatus: processingStatusSchema.optional(),
    search: z.string().trim().min(1).optional(),
    minWidth: z.number().int().positive().optional(),
    maxWidth: z.number().int().positive().optional(),
    minHeight: z.number().int().positive().optional(),
    maxHeight: z.number().int().positive().optional(),
    deleted: deletedStateSchema.default("active"),
    createdAfter: isoTimestampSchema.optional(),
    createdBefore: isoTimestampSchema.optional(),
    sortField: assetSortFieldSchema.default("createdAt"),
    sortDirection: sortDirectionSchema.default("desc"),
  })
  .refine(
    (value) =>
      value.minWidth === undefined ||
      value.maxWidth === undefined ||
      value.minWidth <= value.maxWidth,
    {
      message: "minWidth must not be greater than maxWidth",
      path: ["minWidth"],
    },
  )
  .refine(
    (value) =>
      value.minHeight === undefined ||
      value.maxHeight === undefined ||
      value.minHeight <= value.maxHeight,
    {
      message: "minHeight must not be greater than maxHeight",
      path: ["minHeight"],
    },
  )
  .refine(
    (value) =>
      value.createdAfter === undefined ||
      value.createdBefore === undefined ||
      Date.parse(value.createdAfter) <= Date.parse(value.createdBefore),
    {
      message: "createdAfter must not be after createdBefore",
      path: ["createdAfter"],
    },
  );
export type AssetFilter = z.infer<typeof assetFilterSchema>;
