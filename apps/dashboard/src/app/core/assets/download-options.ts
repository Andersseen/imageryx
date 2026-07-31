import type { ImageAsset } from "@imageryx/sdk";
import type { VariantView } from "./variant-view";

/** Matches `SYSTEM_PRESET_DEFINITIONS`' `download-high` slug in `@imageryx/database` — the one system preset meant specifically for downloads. */
export const DOWNLOAD_HIGH_PRESET_SLUG = "download-high";

export type DownloadOptionKind = "original" | "variant";

export interface DownloadOption {
  kind: DownloadOptionKind;
  /** The value `createDownloadUrl`'s `variant` field expects: `"original"` or a variant id. */
  variantParam: string;
  label: string;
  format: string | null;
  dimensions: { width: number | null; height: number | null };
  sizeBytes: number | null;
  available: boolean;
  /** Why `available` is false, for rendering next to a disabled option instead of just hiding it. */
  unavailableReason: string | null;
  highlighted: boolean;
}

/**
 * Builds the real, available download options for an asset — never a placeholder list. The
 * original is included whenever it exists (its availability is governed by
 * `downloadOriginalEnabled` and enforced server-side at signed-download issuance, not hidden
 * here) and every *ready* variant is offered; a pending/processing/failed variant is excluded
 * entirely rather than shown disabled, since there is nothing yet to download.
 */
export function buildDownloadOptions(
  asset: ImageAsset,
  variantViews: readonly VariantView[],
): DownloadOption[] {
  const options: DownloadOption[] = [
    {
      kind: "original",
      variantParam: "original",
      label: "Original",
      format: asset.mimeType,
      dimensions: { width: asset.width, height: asset.height },
      sizeBytes: asset.sizeBytes,
      available: asset.downloadOriginalEnabled,
      unavailableReason: asset.downloadOriginalEnabled
        ? null
        : "Original downloads are disabled for this asset.",
      highlighted: false,
    },
  ];

  for (const view of variantViews) {
    if (view.variant.status !== "ready") continue;
    options.push({
      kind: "variant",
      variantParam: view.variant.id,
      label: view.presetName,
      format: view.variant.mimeType,
      dimensions: { width: view.variant.width, height: view.variant.height },
      sizeBytes: view.variant.sizeBytes,
      available: true,
      unavailableReason: null,
      highlighted: view.presetSlug === DOWNLOAD_HIGH_PRESET_SLUG,
    });
  }

  return options;
}
