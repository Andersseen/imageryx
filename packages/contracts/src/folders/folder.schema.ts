import { z } from "zod";
import {
  folderIdSchema,
  isoTimestampSchema,
  logicalPathSchema,
  projectIdSchema,
  slugSchema,
} from "../common/identifiers";

export const FOLDER_NAME_MAX_LENGTH = 120;

export const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(FOLDER_NAME_MAX_LENGTH);
export const folderSlugSchema = slugSchema;

export const folderSchema = z.object({
  id: folderIdSchema,
  projectId: projectIdSchema,
  parentId: folderIdSchema.nullable(),
  name: folderNameSchema,
  slug: folderSlugSchema,
  path: logicalPathSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Folder = z.infer<typeof folderSchema>;
