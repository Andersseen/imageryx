import { z } from "zod";
import {
  isoTimestampSchema,
  projectIdSchema,
  slugSchema,
} from "../common/identifiers";

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;

export const projectNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PROJECT_NAME_MAX_LENGTH);
export const projectSlugSchema = slugSchema;
export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH)
  .nullable();

export const projectSchema = z.object({
  id: projectIdSchema,
  name: projectNameSchema,
  slug: projectSlugSchema,
  description: projectDescriptionSchema,
  isDefault: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Project = z.infer<typeof projectSchema>;
