import { z } from "zod";
import { projectIdSchema } from "../common/identifiers";
import { paginationInputSchema } from "../common/pagination";
import {
  projectDescriptionSchema,
  projectNameSchema,
  projectSlugSchema,
} from "./project.schema";

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
  slug: projectSlugSchema.optional(),
  description: projectDescriptionSchema.optional(),
  isDefault: z.boolean().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    id: projectIdSchema,
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.isDefault !== undefined,
    {
      message: "at least one updatable field must be provided",
    },
  );
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const getProjectInputSchema = z.object({ id: projectIdSchema });
export type GetProjectInput = z.infer<typeof getProjectInputSchema>;

export const listProjectsInputSchema = paginationInputSchema.extend({
  search: z.string().trim().min(1).optional(),
});
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;

export const deleteProjectInputSchema = z.object({ id: projectIdSchema });
export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;
