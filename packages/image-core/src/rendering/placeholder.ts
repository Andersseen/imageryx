import { utf8ToBase64 } from "../security/base64";

/**
 * First implementation of placeholder extraction (see context.md and
 * ARCHITECTURE.md): a deterministic color approximation and a tiny
 * generated SVG, never real pixel/BlurHash analysis. Both are explicit
 * simplifications, not a claim of visual accuracy.
 */

/** Treats the first 3 bytes of a SHA-256 checksum as an RGB triple — deterministic, but not a real dominant-color sample of the pixels. */
export function approximateDominantColorFromChecksum(checksumHex: string): string {
  const rgbHex = checksumHex.slice(0, 6).padEnd(6, "0");
  return `#${rgbHex}`;
}

/** A tiny solid-color SVG, base64-encoded as a `data:` URI — cheap to store inline on the asset row (no storage round-trip needed to render a placeholder). */
export function buildColorPlaceholderDataUri(
  hexColor: string,
  width = 4,
  height = 3,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${hexColor}"/></svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}
