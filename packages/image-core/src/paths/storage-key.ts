import type { SupportedImageExtension } from "@imageryx/contracts";
import { InvalidImagePathError } from "../errors/domain-errors";

/**
 * Physical storage keys are opaque and provider-facing — never built from
 * user-controlled logical paths or filenames, only from our own generated
 * identifiers (project/asset/job/export IDs) and a small closed set of
 * prefixes. This is what lets a folder or asset be renamed without moving
 * any bytes in storage.
 */
const OPAQUE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertOpaqueSegment(value: string, label: string): string {
  if (!OPAQUE_SEGMENT_PATTERN.test(value)) {
    throw new InvalidImagePathError(
      `${label} must be an opaque identifier (letters, numbers, "-", "_" only)`,
    );
  }
  return value;
}

export function buildOriginalStorageKey(
  projectId: string,
  assetId: string,
  extension: SupportedImageExtension,
): string {
  return `originals/${assertOpaqueSegment(projectId, "projectId")}/${assertOpaqueSegment(assetId, "assetId")}/original.${extension}`;
}

export function buildDerivedStorageKey(
  projectId: string,
  assetId: string,
  presetHash: string,
  extension: SupportedImageExtension,
): string {
  return `derived/${assertOpaqueSegment(projectId, "projectId")}/${assertOpaqueSegment(assetId, "assetId")}/${assertOpaqueSegment(presetHash, "presetHash")}.${extension}`;
}

/**
 * `generatedName` still passes through `assertOpaqueSegment`: callers are
 * expected to have produced it themselves (e.g. `crypto.randomUUID()`),
 * but this function doesn't trust that — it re-validates rather than
 * assuming.
 */
export function buildTemporaryStorageKey(
  projectId: string,
  jobId: string,
  generatedName: string,
): string {
  return `temporary/${assertOpaqueSegment(projectId, "projectId")}/${assertOpaqueSegment(jobId, "jobId")}/${assertOpaqueSegment(generatedName, "generatedName")}`;
}

export function buildExportStorageKey(
  projectId: string,
  exportId: string,
): string {
  return `exports/${assertOpaqueSegment(projectId, "projectId")}/${assertOpaqueSegment(exportId, "exportId")}.zip`;
}
