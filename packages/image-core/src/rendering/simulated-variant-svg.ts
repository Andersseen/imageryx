function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface SimulatedVariantSvgInput {
  assetName: string;
  presetName: string;
  width: number;
  height: number;
  outputFormat: string;
}

/**
 * A real, valid SVG image standing in for a real transformation result —
 * never JSON pretending to be an image (see context.md's "Mocked
 * behavior" section). Visibly encodes the source asset name, preset name,
 * resolved output dimensions/format, and an explicit "Simulated
 * transformation" label, so the output can never be mistaken for a real
 * derivative even without inspecting response headers.
 */
export function renderSimulatedVariantSvg(input: SimulatedVariantSvgInput): string {
  const { assetName, presetName, width, height, outputFormat } = input;
  const safeAssetName = escapeXml(assetName);
  const safePresetName = escapeXml(presetName);
  const label = `${safeAssetName} — ${safePresetName} (${width}x${height}, ${escapeXml(outputFormat)}, simulated)`;
  const titleFontSize = Math.max(11, Math.round(Math.min(width, height) / 13));
  const subtitleFontSize = Math.max(9, Math.round(Math.min(width, height) / 20));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="ixg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#22d3ee" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#ixg)" />
  <rect width="${width}" height="${height}" fill="none" stroke="#1e293b" stroke-width="3" />
  <text x="50%" y="44%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${titleFontSize}" fill="#ffffff">${safeAssetName} / ${safePresetName}</text>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${subtitleFontSize}" fill="#e0e7ff">${width} x ${height} - ${escapeXml(outputFormat)}</text>
  <text x="50%" y="68%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${subtitleFontSize}" fill="#c7d2fe" font-weight="bold">Simulated transformation</text>
</svg>`;
}
