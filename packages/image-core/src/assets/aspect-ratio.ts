/** Fixed at 4 decimal places — enough to distinguish common ratios (16:9 = 1.7778) without floating-point noise affecting equality checks. */
const ASPECT_RATIO_PRECISION = 4;
const PRECISION_FACTOR = 10 ** ASPECT_RATIO_PRECISION;

/** Returns `null` for missing, zero, negative, or non-finite dimensions rather than throwing — aspect ratio is optional metadata, not a validated field. */
export function computeAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return Math.round((width / height) * PRECISION_FACTOR) / PRECISION_FACTOR;
}
