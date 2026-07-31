import { PROJECT_NAME_MAX_LENGTH } from "@imageryx/contracts";

export interface ProjectFormValue {
  name: string;
  slug: string;
}

export interface ProjectFormErrors {
  name?: string;
  slug?: string;
}

/** Mirrors `slugSchema` in `@imageryx/contracts` — lowercase alphanumerics and single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a URL-safe slug from a display name, using the same normalization the API applies
 * server-side (`apps/api-worker/src/lib/slugify.ts`).
 *
 * This is a *convenience* for pre-filling the field, never a substitute for the server's own
 * slugify: the API remains the authority, and this only exists so the user sees what they are
 * about to get before submitting.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Client-side validation of the project form.
 *
 * Deliberately a *subset* of the server's rules, not a reimplementation of them: it catches the
 * mistakes worth catching before a round trip (empty name, malformed slug) and leaves everything
 * else — uniqueness above all, which no client can know — to the API, whose conflict response is
 * surfaced verbatim. Duplicating the full rule set here would guarantee the two drift apart.
 */
export function validateProjectForm(
  value: ProjectFormValue,
  options: { requireSlug: boolean },
): ProjectFormErrors {
  const errors: ProjectFormErrors = {};

  const name = value.name.trim();
  if (name.length === 0) {
    errors.name = "A project name is required.";
  } else if (name.length > PROJECT_NAME_MAX_LENGTH) {
    errors.name = `Keep the name to ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (options.requireSlug) {
    const slug = value.slug.trim();
    if (slug.length === 0) {
      errors.slug = "A slug is required.";
    } else if (!SLUG_PATTERN.test(slug)) {
      errors.slug =
        "Use lowercase letters, digits and single hyphens — no spaces, uppercase or leading/trailing hyphens.";
    }
  }

  return errors;
}
