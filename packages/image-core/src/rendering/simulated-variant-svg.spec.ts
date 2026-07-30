import { describe, expect, it } from "vitest";
import { renderSimulatedVariantSvg } from "./simulated-variant-svg";

describe("renderSimulatedVariantSvg", () => {
  it("produces a valid SVG document encoding asset name, preset name, dimensions, and the simulated label", () => {
    const svg = renderSimulatedVariantSvg({
      assetName: "Signals Course Hero",
      presetName: "Hero",
      width: 1920,
      height: 1080,
      outputFormat: "webp",
    });

    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1920"');
    expect(svg).toContain('height="1080"');
    expect(svg).toContain("Signals Course Hero");
    expect(svg).toContain("Hero");
    expect(svg).toContain("webp");
    expect(svg).toContain("Simulated transformation");
  });

  it("escapes XML-significant characters in names", () => {
    const svg = renderSimulatedVariantSvg({
      assetName: `<Cover> & "Title"`,
      presetName: "Thumbnail",
      width: 320,
      height: 320,
      outputFormat: "auto",
    });

    expect(svg).not.toContain("<Cover>");
    expect(svg).toContain("&lt;Cover&gt;");
    expect(svg).toContain("&amp;");
  });
});
