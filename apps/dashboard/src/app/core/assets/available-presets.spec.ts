import { describe, expect, it } from "vitest";
import { filterPresetsForAsset, type PresetOption } from "./available-presets";

const RASTER_PRESET: PresetOption = {
  id: "p1",
  name: "Thumbnail",
  slug: "thumbnail",
  outputFormat: "auto",
};
const SVG_PRESET: PresetOption = {
  id: "p2",
  name: "SVG Optimized",
  slug: "svg-optimized",
  outputFormat: "svg",
};

describe("filterPresetsForAsset", () => {
  it("shows only svg-output presets for an SVG asset", () => {
    const result = filterPresetsForAsset(
      [RASTER_PRESET, SVG_PRESET],
      "image/svg+xml",
    );
    expect(result).toEqual([SVG_PRESET]);
  });

  it("shows only raster presets for a raster asset", () => {
    const result = filterPresetsForAsset(
      [RASTER_PRESET, SVG_PRESET],
      "image/png",
    );
    expect(result).toEqual([RASTER_PRESET]);
  });

  it("returns an empty list when no preset matches the asset type", () => {
    expect(filterPresetsForAsset([SVG_PRESET], "image/png")).toEqual([]);
    expect(filterPresetsForAsset([RASTER_PRESET], "image/svg+xml")).toEqual([]);
  });
});
