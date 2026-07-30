import { z } from "zod";

/**
 * Identifiers are plain strings (UUIDs), not branded types: Phase 2 stores
 * them as D1 TEXT primary keys, and opaque branding would force casts at
 * every repository row-mapping boundary for no real safety gain here.
 */
export type ProjectId = string;
export type FolderId = string;
export type AssetId = string;
export type PresetId = string;
export type VariantId = string;
export type ProcessingJobId = string;
export type TagId = string;
export type ApiKeyId = string;

export const uuidSchema = z.uuid();

export const projectIdSchema = uuidSchema;
export const folderIdSchema = uuidSchema;
export const assetIdSchema = uuidSchema;
export const presetIdSchema = uuidSchema;
export const variantIdSchema = uuidSchema;
export const processingJobIdSchema = uuidSchema;
export const tagIdSchema = uuidSchema;
export const apiKeyIdSchema = uuidSchema;

/**
 * Lowercase, hyphen-separated segments. The regex alone rules out leading/
 * trailing/doubled hyphens (a leading or trailing hyphen, or two in a row,
 * cannot appear inside `[a-z0-9]+(-[a-z0-9]+)*`), so no extra refinement
 * is needed for the "slugs may not start or end with a hyphen" rule.
 */
export const SLUG_MAX_LENGTH = 80;
export const slugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "must be lowercase alphanumeric segments separated by single hyphens",
  );

/**
 * Structural, wire-level path validation only. The authoritative algorithm
 * (normalize/join/validate, traversal rejection, typed errors) lives in
 * `@imageryx/image-core` — contracts stay free of business logic per the
 * package boundary rules, so this schema exists to fail obviously bad
 * input fast at the API edge, not to be the single source of truth.
 */
export const LOGICAL_PATH_MAX_LENGTH = 1024;
const FORBIDDEN_LOGICAL_PATH_PATTERN = /^\/|\/$|\/\/|\\|\0|(^|\/)\.\.?(\/|$)/;

export const logicalPathSchema = z
  .string()
  .max(LOGICAL_PATH_MAX_LENGTH)
  .refine(
    (value) => value === "" || !FORBIDDEN_LOGICAL_PATH_PATTERN.test(value),
    {
      message:
        'logical path must be normalized: no leading/trailing/repeated separators, no "." or ".." segments, no backslashes or null bytes',
    },
  );

export const isoTimestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a valid ISO-8601 timestamp",
  });

/** Lowercase hex-encoded SHA-256, as produced by `@imageryx/image-core`'s checksum utility. */
export const checksumSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a lowercase hex-encoded SHA-256 checksum");

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
] as const;
export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];
export const supportedImageMimeTypeSchema = z.enum(SUPPORTED_IMAGE_MIME_TYPES);

export const SUPPORTED_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "svg",
] as const;
export type SupportedImageExtension =
  (typeof SUPPORTED_IMAGE_EXTENSIONS)[number];
export const supportedImageExtensionSchema = z.enum(SUPPORTED_IMAGE_EXTENSIONS);

/** A MIME type may normalize to more than one extension (jpeg/jpg); extension-to-MIME is always 1:1. */
export const MIME_TYPE_TO_EXTENSIONS: Readonly<
  Record<SupportedImageMimeType, readonly SupportedImageExtension[]>
> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "image/gif": ["gif"],
  "image/svg+xml": ["svg"],
};

export const EXTENSION_TO_MIME_TYPE: Readonly<
  Record<SupportedImageExtension, SupportedImageMimeType>
> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};
