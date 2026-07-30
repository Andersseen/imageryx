import { z } from "zod";

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export interface SortInput<TField extends string> {
  field: TField;
  direction: SortDirection;
}

/** Builds a `{ field, direction }` schema scoped to a fixed set of sortable fields for one list endpoint. */
export function createSortFieldSchema<TField extends [string, ...string[]]>(
  fields: TField,
) {
  return z.enum(fields);
}
