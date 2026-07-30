import { z } from "zod";
import { folderIdSchema, projectIdSchema } from "../common/identifiers";
import { folderNameSchema, folderSlugSchema } from "./folder.schema";

export const createFolderInputSchema = z.object({
  projectId: projectIdSchema,
  parentId: folderIdSchema.nullable().optional(),
  name: folderNameSchema,
  slug: folderSlugSchema.optional(),
});
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

export const updateFolderInputSchema = z
  .object({
    id: folderIdSchema,
    name: folderNameSchema.optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: "at least one updatable field must be provided",
  });
export type UpdateFolderInput = z.infer<typeof updateFolderInputSchema>;

export const moveFolderInputSchema = z.object({
  id: folderIdSchema,
  parentId: folderIdSchema.nullable(),
});
export type MoveFolderInput = z.infer<typeof moveFolderInputSchema>;

export const getFolderInputSchema = z.object({ id: folderIdSchema });
export type GetFolderInput = z.infer<typeof getFolderInputSchema>;

export const listFoldersInputSchema = z.object({
  projectId: projectIdSchema,
  parentId: folderIdSchema.nullable().optional(),
});
export type ListFoldersInput = z.infer<typeof listFoldersInputSchema>;

export const deleteFolderInputSchema = z.object({ id: folderIdSchema });
export type DeleteFolderInput = z.infer<typeof deleteFolderInputSchema>;
