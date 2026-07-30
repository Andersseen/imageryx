import {
  SUPPORTED_IMAGE_EXTENSIONS,
  type SupportedImageExtension,
} from "@imageryx/contracts";

/**
 * Unicode strategy: NFKD-normalize, then strip Latin combining diacritical
 * marks (U+0300-U+036F) so accented Latin text degrades gracefully
 * ("cafe" with an accent -> "cafe") before the ASCII slug filter runs.
 * Non-Latin scripts (Cyrillic, CJK, etc.) have no such decomposition and
 * are not transliterated -- they fall through the `[^a-z0-9]` filter and
 * hit the fallback basename below. This is a deliberate simplification:
 * shipping a full transliteration table is out of scope for Phase 2, and a
 * deterministic fallback is safer than a lossy, hard-to-predict mapping.
 */
export const FILENAME_MAX_LENGTH = 180;
export const FILENAME_FALLBACK_BASENAME = "image";

export interface NormalizedFilename {
  /** Full normalized filename, including extension when one is known: "my-hero-image.png". */
  slug: string;
  /** The slug without its extension: "my-hero-image". */
  base: string;
  extension: SupportedImageExtension | null;
}

// eslint-disable-next-line no-control-regex -- intentionally strips C0 control characters (U+0000-U+001F) and DEL (U+007F)
const CONTROL_CHARACTERS_PATTERN = /[\x00-\x1f\x7f]/g;
const PATH_SEPARATORS_PATTERN = /[/\\]+/g;
const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const REPEATED_DOTS_PATTERN = /\.{2,}/g;
const LEADING_DOTS_PATTERN = /^\.+/;
const NON_SLUG_CHARACTERS_PATTERN = /[^a-z0-9]+/g;
const REPEATED_HYPHENS_PATTERN = /-{2,}/g;
const LEADING_TRAILING_HYPHENS_PATTERN = /^-+|-+$/g;
const TRAILING_HYPHENS_PATTERN = /-+$/;

function normalizeExtensionCandidate(
  candidate: string | null | undefined,
): SupportedImageExtension | null {
  if (!candidate) return null;
  const lower = candidate.toLowerCase();
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(lower)
    ? (lower as SupportedImageExtension)
    : null;
}

function slugifyBase(rawBase: string): string {
  const slug = rawBase
    .toLowerCase()
    .replace(NON_SLUG_CHARACTERS_PATTERN, "-")
    .replace(REPEATED_HYPHENS_PATTERN, "-")
    .replace(LEADING_TRAILING_HYPHENS_PATTERN, "");
  return slug.length > 0 ? slug : FILENAME_FALLBACK_BASENAME;
}

/**
 * Normalizes a user-supplied filename into a safe, deterministic slug.
 * Never throws: unrepresentable input degrades to `FILENAME_FALLBACK_BASENAME`
 * rather than failing, since a missing/garbled original filename should not
 * block asset registration.
 *
 * `claimedExtension`, when provided (e.g. from validated MIME detection),
 * always wins over whatever extension is parsed out of `rawName` -- trusting
 * the raw name's extension is exactly the "don't infer trust from extension
 * alone" mistake this function exists to avoid at the naming layer.
 */
export function normalizeFilename(
  rawName: string,
  claimedExtension?: SupportedImageExtension,
): NormalizedFilename {
  const withoutControlCharacters = rawName
    .trim()
    .replace(CONTROL_CHARACTERS_PATTERN, "");
  const withoutSeparators = withoutControlCharacters.replace(
    PATH_SEPARATORS_PATTERN,
    "-",
  );
  const unicodeNormalized = withoutSeparators
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS_PATTERN, "");

  const lastDotIndex = unicodeNormalized.lastIndexOf(".");
  const hasTrailingExtension =
    lastDotIndex > 0 && lastDotIndex < unicodeNormalized.length - 1;

  const rawBase = (
    hasTrailingExtension
      ? unicodeNormalized.slice(0, lastDotIndex)
      : unicodeNormalized.replace(LEADING_DOTS_PATTERN, "")
  ).replace(REPEATED_DOTS_PATTERN, "-");
  const rawExtension = hasTrailingExtension
    ? unicodeNormalized.slice(lastDotIndex + 1)
    : null;

  const base = slugifyBase(rawBase);
  const extension =
    claimedExtension ?? normalizeExtensionCandidate(rawExtension);

  return truncateToMaxLength(base, extension);
}

function truncateToMaxLength(
  base: string,
  extension: SupportedImageExtension | null,
): NormalizedFilename {
  const suffix = extension ? `.${extension}` : "";
  if (base.length + suffix.length <= FILENAME_MAX_LENGTH) {
    return { slug: `${base}${suffix}`, base, extension };
  }

  const maxBaseLength = Math.max(1, FILENAME_MAX_LENGTH - suffix.length);
  const truncatedBase =
    base.slice(0, maxBaseLength).replace(TRAILING_HYPHENS_PATTERN, "") ||
    FILENAME_FALLBACK_BASENAME;
  return { slug: `${truncatedBase}${suffix}`, base: truncatedBase, extension };
}
