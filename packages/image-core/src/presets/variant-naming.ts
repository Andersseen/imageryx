import type { SupportedImageExtension } from "@imageryx/contracts";

/**
 * Deterministic from asset ID + normalized preset hash + output extension
 * only — never from the preset slug, since a preset can be renamed (or a
 * new preset created with the same slug after the original is deleted)
 * without invalidating already-generated variants that share its hash.
 */
export function buildVariantObjectName(
  assetId: string,
  presetHash: string,
  extension: SupportedImageExtension,
): string {
  return `${assetId}-${presetHash}.${extension}`;
}
