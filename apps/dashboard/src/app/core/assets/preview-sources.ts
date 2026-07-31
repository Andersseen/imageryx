import type { ImageVariant } from "@imageryx/sdk";
import type { VariantView } from "./variant-view";

export interface PreviewSource {
  url: string;
  width: number | null;
  height: number | null;
  label: string;
}

export interface PreviewSourceOption {
  key: string;
  source: PreviewSource;
}

/**
 * Builds the preview workspace's "active variant" list: the original, plus every variant that
 * actually has a real delivery URL — which, per `toVariantView`, means `ready` with a resolvable
 * preset. A pending, processing or failed variant is not offered: there is no image behind it
 * yet, so it would either 404 or force a needless request.
 */
export function buildPreviewSources(
  originalUrl: string | null,
  originalWidth: number | null,
  originalHeight: number | null,
  variants: readonly { view: VariantView; variant: ImageVariant }[],
): PreviewSourceOption[] {
  const sources: PreviewSourceOption[] = [];
  if (originalUrl) {
    sources.push({
      key: "original",
      source: {
        url: originalUrl,
        width: originalWidth,
        height: originalHeight,
        label: "Original",
      },
    });
  }
  for (const { view, variant } of variants) {
    if (!view.deliveryUrl) continue;
    sources.push({
      key: variant.id,
      source: {
        url: view.deliveryUrl,
        width: variant.width,
        height: variant.height,
        label: view.presetName,
      },
    });
  }
  return sources;
}
