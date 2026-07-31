import type { AssetListItem } from "@imageryx/sdk";

/** Preset slugs to try for a grid thumbnail, smallest first — see `resolveThumbnailPreset`. */
export const THUMBNAIL_PRESET_PREFERENCE: readonly string[] = [
  "thumbnail",
  "avatar",
  "project-card",
];

/**
 * Which preset's delivery URL is safe to render as this asset's thumbnail, or `null` for none.
 *
 * "Safe" is doing real work here. A preset delivery URL resolves only when its variant is
 * already `ready` — the delivery worker never generates on demand (see ARCHITECTURE.md's
 * delivery flow) — and a private or soft-deleted asset always 404s by design, without
 * distinguishing itself from one that never existed. Guessing wrong therefore costs a failed
 * request per tile per render, which is exactly the kind of speculative traffic a grid should
 * not generate. `readyPresetSlugs` (added to the list response for this) turns the guess into a
 * lookup.
 *
 * The original is deliberately never used as a fallback: it is full resolution, and downloading
 * a 6 MB source file to paint a 200px tile is the single worst thing an asset grid can do.
 */
export function resolveThumbnailPreset(asset: AssetListItem): string | null {
  if (asset.visibility !== "public") return null;
  if (asset.deletedAt !== null) return null;
  if (asset.processingStatus !== "ready") return null;

  const ready = new Set(asset.readyPresetSlugs);
  return THUMBNAIL_PRESET_PREFERENCE.find((slug) => ready.has(slug)) ?? null;
}

/**
 * Why an asset has no real thumbnail — so the tile can say so instead of showing a blank box.
 * Each of these is a genuine state of the system, not an error path.
 */
export type ThumbnailFallbackReason =
  | "private"
  | "deleted"
  | "processing"
  | "failed"
  | "no-variant";

export function thumbnailFallbackReason(
  asset: AssetListItem,
): ThumbnailFallbackReason | null {
  if (resolveThumbnailPreset(asset) !== null) return null;
  if (asset.deletedAt !== null) return "deleted";
  if (asset.visibility !== "public") return "private";
  if (asset.processingStatus === "failed") return "failed";
  if (asset.processingStatus !== "ready") return "processing";
  return "no-variant";
}

const FALLBACK_LABELS: Record<ThumbnailFallbackReason, string> = {
  private: "Private — no public preview",
  deleted: "Deleted",
  processing: "Processing",
  failed: "Processing failed",
  "no-variant": "No thumbnail variant yet",
};

export function thumbnailFallbackLabel(
  reason: ThumbnailFallbackReason,
): string {
  return FALLBACK_LABELS[reason];
}

/**
 * The always-available visual: the deterministic solid-colour placeholder generated during
 * metadata inspection. It costs zero network requests (it is a `data:` URI already on the row)
 * and it is a real property of the asset, not decoration — but it is derived from the checksum,
 * not sampled from the image, so it is never presented as a preview of the actual picture.
 */
export function placeholderBackground(asset: AssetListItem): string | null {
  if (asset.placeholder)
    return `url("${asset.placeholder}") center / cover no-repeat`;
  if (asset.dominantColor) return asset.dominantColor;
  return null;
}
