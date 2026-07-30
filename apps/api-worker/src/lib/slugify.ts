import { ValidationHttpError } from "./errors";

/** A conservative fallback slug generator for user-facing names (projects, folders, presets). Never produces the empty string. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length === 0) {
    throw new ValidationHttpError("Could not derive a slug from the given name.");
  }
  return base;
}
