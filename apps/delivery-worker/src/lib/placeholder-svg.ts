const MIN_DIMENSION = 16;
const MAX_DIMENSION = 2000;
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

function clampDimension(value: number | null, fallback: number): number {
  if (value === null || Number.isNaN(value)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
}

/**
 * Generates a small, dependency-free SVG placeholder image entirely in
 * code (diagonal stripes, checkerboard corner, and the requested pixel
 * dimensions). Stands in for real asset delivery, which is implemented in
 * a later phase.
 */
export function renderPlaceholderSvg(rawWidth: string | null, rawHeight: string | null): string {
  const width = clampDimension(rawWidth === null ? null : Number(rawWidth), DEFAULT_WIDTH);
  const height = clampDimension(rawHeight === null ? null : Number(rawHeight), DEFAULT_HEIGHT);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Imageryx placeholder preview, ${width} by ${height} pixels">
  <defs>
    <pattern id="stripes" width="24" height="24" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="12" height="24" fill="#e2e8f0" />
      <rect x="12" width="12" height="24" fill="#f1f5f9" />
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#stripes)" />
  <rect width="${width}" height="${height}" fill="none" stroke="#94a3b8" stroke-width="2" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${Math.max(12, Math.min(width, height) / 10)}" fill="#475569">
    ${width} × ${height}
  </text>
</svg>`;
}
