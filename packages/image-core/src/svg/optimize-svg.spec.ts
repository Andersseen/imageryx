import { describe, expect, it } from "vitest";
import { SvgOptimizationError } from "../errors/domain-errors";
import { optimizeSvgSource } from "./optimize-svg";

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <title>Company Logo</title>
  <desc>A stylized letter mark used in the primary brand logo.</desc>
  <metadata>Created with Sketch.</metadata>
  <!-- a comment -->
  <g>
    <path d="M10.000000 10.000000 L90.000000 90.000000" fill="#ff0000" />
  </g>
</svg>`;

describe("optimizeSvgSource", () => {
  it("shrinks well-formed SVG and preserves viewBox, title, and meaningful desc", () => {
    const result = optimizeSvgSource(SAMPLE_SVG);

    expect(result.optimizedSizeBytes).toBeLessThan(result.originalSizeBytes);
    expect(result.svg).toContain('viewBox="0 0 100 100"');
    expect(result.svg).toContain("<title>Company Logo</title>");
    expect(result.svg).toContain("A stylized letter mark");
    expect(result.svg).not.toContain("<!--");
    expect(result.svg).not.toContain("<metadata>");
  });

  it("removes <desc> that is empty or standard editor boilerplate, matching svgo's accessibility-safe default", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc>Created with Sketch.</desc></svg>`;
    const result = optimizeSvgSource(svg);
    expect(result.svg).not.toContain("<desc>");
  });

  it("strips <script> elements regardless of caller options", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.cookie)</script><rect width="10" height="10"/></svg>`;
    const result = optimizeSvgSource(svg);
    expect(result.svg).not.toContain("<script");
    expect(result.svg).not.toContain("alert(");
  });

  it("strips event-handler attributes", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" onload="alert(1)" onclick="alert(2)"/></svg>`;
    const result = optimizeSvgSource(svg);
    expect(result.svg).not.toContain("onload");
    expect(result.svg).not.toContain("onclick");
  });

  it("strips executable content inside foreignObject", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml" onload="alert(1)"></body></foreignObject></svg>`;
    const result = optimizeSvgSource(svg);
    expect(result.svg).not.toContain("onload");
  });

  it("neutralizes javascript: URLs on anchors", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>`;
    const result = optimizeSvgSource(svg);
    expect(result.svg).not.toContain("javascript:");
  });

  it("respects removeComments: false", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- keep me --><rect width="10" height="10"/></svg>`;
    const result = optimizeSvgSource(svg, { removeComments: false });
    expect(result.svg).toContain("keep me");
  });

  it("respects removeMetadata: false", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><metadata>keep me</metadata><rect width="10" height="10"/></svg>`;
    const result = optimizeSvgSource(svg, { removeMetadata: false });
    expect(result.svg).toContain("<metadata>");
  });

  it("applies a custom numeric precision", () => {
    const result = optimizeSvgSource(SAMPLE_SVG, { precision: 1 });
    expect(result.svg).not.toContain("10.000000");
  });

  it("is deterministic for the same input and options", () => {
    const first = optimizeSvgSource(SAMPLE_SVG);
    const second = optimizeSvgSource(SAMPLE_SVG);
    expect(first.svg).toBe(second.svg);
  });

  it("throws SvgOptimizationError for unparseable input", () => {
    expect(() => optimizeSvgSource("<svg><rect></svg")).toThrow(
      SvgOptimizationError,
    );
  });
});
