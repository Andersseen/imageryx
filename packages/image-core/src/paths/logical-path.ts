import { InvalidImagePathError } from "../errors/domain-errors";

/**
 * Logical paths describe *where an asset lives in the project's folder
 * tree* ("profile/andrii"). They are never used as physical storage keys
 * (see `paths/storage-key.ts`) — that separation is what lets folders be
 * renamed/moved without rewriting object storage.
 *
 * Normalization is intentionally strict rather than lenient: repeated
 * separators, `.`/`..` segments, and encoded traversal are all rejected
 * outright (not silently collapsed), so a caller never gets back a path
 * that means something different from what they typed.
 */
const NULL_BYTE_PATTERN = /\0/;
const BACKSLASH_PATTERN = /\\/;
const PERCENT_ENCODING_PATTERN = /%[0-9a-fA-F]{2}/;
const VALID_SEGMENT_PATTERN = /^[^/\\\0]+$/;

function assertNoNullBytes(value: string): void {
  if (NULL_BYTE_PATTERN.test(value)) {
    throw new InvalidImagePathError("logical path must not contain null bytes");
  }
}

function assertNoBackslashes(value: string): void {
  if (BACKSLASH_PATTERN.test(value)) {
    throw new InvalidImagePathError(
      "logical path must not contain backslashes",
    );
  }
}

/**
 * Rejects percent-encoded sequences outright rather than decoding them:
 * a caller passing an already-decoded logical path should never contain
 * "%2e%2e" or similar, so its presence is itself the traversal attempt —
 * decoding-then-validating would just move the same risk one step later.
 */
function assertNoEncodedTraversal(value: string): void {
  if (PERCENT_ENCODING_PATTERN.test(value)) {
    throw new InvalidImagePathError(
      "logical path must not contain percent-encoded sequences",
    );
  }
}

function validateSegment(segment: string): string {
  if (segment.length === 0) {
    throw new InvalidImagePathError(
      "logical path must not contain empty segments (repeated separators)",
    );
  }
  if (segment === "." || segment === "..") {
    throw new InvalidImagePathError(
      'logical path must not contain "." or ".." segments',
    );
  }
  if (!VALID_SEGMENT_PATTERN.test(segment)) {
    throw new InvalidImagePathError(
      `logical path segment "${segment}" contains an invalid character`,
    );
  }
  return segment;
}

/**
 * Normalizes a logical path: trims surrounding whitespace and a single
 * leading/trailing separator, then validates every segment. The empty
 * string normalizes to itself and represents the project root.
 */
export function normalizeLogicalPath(input: string): string {
  assertNoNullBytes(input);
  assertNoBackslashes(input);
  assertNoEncodedTraversal(input);

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed.startsWith("/")) {
    throw new InvalidImagePathError("logical path must not be absolute");
  }
  if (trimmed.endsWith("/")) {
    throw new InvalidImagePathError(
      "logical path must not end with a separator",
    );
  }

  const segments = trimmed.split("/").map(validateSegment);
  return segments.join("/");
}

/** Throws if `path` is not already normalized — for validating a value that must not be transformed, only checked. */
export function validateLogicalPath(path: string): void {
  const normalized = normalizeLogicalPath(path);
  if (normalized !== path) {
    throw new InvalidImagePathError("logical path is not normalized");
  }
}

/** Joins already-valid segments (folder names, asset slugs) into a normalized logical path. */
export function joinLogicalPath(...segments: readonly string[]): string {
  const nonEmpty = segments.filter((segment) => segment.length > 0);
  return normalizeLogicalPath(nonEmpty.join("/"));
}
