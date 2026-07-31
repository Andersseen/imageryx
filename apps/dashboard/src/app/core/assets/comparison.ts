import type { ImageAsset, ImageVariant } from "@imageryx/sdk";

export interface ComparisonSummary {
  originalSizeBytes: number;
  variantSizeBytes: number | null;
  /** Positive = smaller than the original, negative = larger. `null` when the variant size is unknown. */
  percentSaved: number | null;
  originalDimensions: { width: number | null; height: number | null };
  variantDimensions: { width: number | null; height: number | null };
  variantFormat: string | null;
  /** True for the mock provider — the comparison must not be read as evidence of real compression quality. */
  isSimulated: boolean;
}

/**
 * Summarizes an original-vs-variant comparison as plain numbers; the component decides how to
 * lay them out (side-by-side, slider). Kept separate from rendering so the one thing worth
 * getting right — the percentage-saved math and the simulated flag — is unit-testable without a
 * DOM.
 *
 * `percentSaved` is deliberately not computed at all when the variant's size is unknown (still
 * processing) — a bar chart or number implying "0% saved" would misreport "not smaller" as an
 * actual measurement instead of "no measurement yet."
 */
export function summarizeComparison(
  asset: ImageAsset,
  variant: ImageVariant,
): ComparisonSummary {
  const percentSaved =
    variant.sizeBytes === null || asset.sizeBytes === 0
      ? null
      : Math.round((1 - variant.sizeBytes / asset.sizeBytes) * 1000) / 10;

  return {
    originalSizeBytes: asset.sizeBytes,
    variantSizeBytes: variant.sizeBytes,
    percentSaved,
    originalDimensions: { width: asset.width, height: asset.height },
    variantDimensions: { width: variant.width, height: variant.height },
    variantFormat: variant.mimeType,
    isSimulated: variant.provider === "mock",
  };
}
