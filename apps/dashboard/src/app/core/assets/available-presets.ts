import type { OutputImageFormat } from "@imageryx/contracts";

export interface PresetOption {
  id: string;
  name: string;
  slug: string;
  outputFormat: OutputImageFormat;
}

/**
 * `outputFormat: "svg"` presets (the "builtin" provider's local SVG
 * optimization) only make sense for an SVG source and never combine with a
 * raster preset in the same request — `validatePresetSemantics()` rejects
 * mixing them, and Cloudflare/Cloudinary can't act on an SVG source at
 * all. Filtering here means a raster asset never even shows a preset it
 * could not use, rather than surfacing a server validation error after
 * the fact.
 */
export function filterPresetsForAsset<T extends PresetOption>(
  presets: readonly T[],
  assetMimeType: string,
): T[] {
  const isSvgAsset = assetMimeType === "image/svg+xml";
  return presets.filter((preset) =>
    isSvgAsset ? preset.outputFormat === "svg" : preset.outputFormat !== "svg",
  );
}
