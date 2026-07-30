import { describe, expect, it } from "vitest";
import { inspectImageDimensions } from "./inspect-dimensions";

describe("inspectImageDimensions", () => {
  it("reads width/height/colorType from a PNG IHDR chunk", () => {
    const bytes = new Uint8Array(29);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
    bytes.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
    bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    bytes.set([0x00, 0x00, 0x00, 0x64], 16); // width = 100
    bytes.set([0x00, 0x00, 0x00, 0x32], 20); // height = 50
    bytes[24] = 0x08; // bit depth
    bytes[25] = 0x06; // color type 6 = truecolor + alpha

    const result = inspectImageDimensions("image/png", bytes);
    expect(result).toEqual({
      width: 100,
      height: 50,
      hasAlpha: true,
      warnings: [],
    });
  });

  it("reports png-ihdr-truncated for a too-short PNG buffer", () => {
    const result = inspectImageDimensions("image/png", new Uint8Array(10));
    expect(result.width).toBeNull();
    expect(result.warnings).toContain("png-ihdr-truncated");
  });

  it("reads width/height from a JPEG SOF0 segment", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x32, 0x00, 0x64, 0x01,
      0x01, 0x11, 0x00,
    ]);
    const result = inspectImageDimensions("image/jpeg", bytes);
    expect(result).toEqual({
      width: 100,
      height: 50,
      hasAlpha: false,
      warnings: [],
    });
  });

  it("skips non-SOF marker segments before finding SOF0", () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]; // APP0, length 4 (2 header + 2 payload)
    const sof0 = [
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x14, 0x00, 0x28, 0x01, 0x01, 0x11,
      0x00,
    ];
    const bytes = new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
    const result = inspectImageDimensions("image/jpeg", bytes);
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
  });

  it("reports jpeg-sof-marker-not-found when no SOF segment exists", () => {
    const result = inspectImageDimensions(
      "image/jpeg",
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
    expect(result.width).toBeNull();
    expect(result.warnings).toContain("jpeg-sof-marker-not-found");
  });

  it("reads little-endian width/height from a GIF logical screen descriptor", () => {
    const bytes = new Uint8Array(13);
    bytes.set(new TextEncoder().encode("GIF89a"), 0);
    bytes.set([0x64, 0x00], 6); // width = 100
    bytes.set([0x32, 0x00], 8); // height = 50
    const result = inspectImageDimensions("image/gif", bytes);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.hasAlpha).toBeNull();
    expect(result.warnings).toContain("gif-alpha-not-detected");
  });

  it("reads width/height/alpha from an extended WebP (VP8X) header", () => {
    const bytes = new Uint8Array(30);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    bytes.set(new TextEncoder().encode("VP8X"), 12);
    bytes[20] = 0x10; // alpha flag set
    bytes.set([0x64, 0x00, 0x00], 24); // width - 1 = 100 -> width = 101
    bytes.set([0x32, 0x00, 0x00], 27); // height - 1 = 50 -> height = 51
    const result = inspectImageDimensions("image/webp", bytes);
    expect(result).toEqual({
      width: 101,
      height: 51,
      hasAlpha: true,
      warnings: [],
    });
  });

  it("reads bit-packed width/height/alpha from a lossless WebP (VP8L) header", () => {
    const width = 100;
    const height = 50;
    const alpha = 1;
    const packed = ((alpha & 0x1) << 28) | ((height - 1) << 14) | (width - 1);
    const bytes = new Uint8Array(25);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    bytes.set(new TextEncoder().encode("VP8L"), 12);
    bytes[20] = 0x2f; // VP8L signature byte
    bytes[21] = packed & 0xff;
    bytes[22] = (packed >>> 8) & 0xff;
    bytes[23] = (packed >>> 16) & 0xff;
    bytes[24] = (packed >>> 24) & 0xff;
    const result = inspectImageDimensions("image/webp", bytes);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.hasAlpha).toBe(true);
  });

  it("reads width/height from explicit SVG attributes", () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect/></svg>`;
    const result = inspectImageDimensions(
      "image/svg+xml",
      new TextEncoder().encode(svg),
    );
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it("falls back to viewBox when width/height attributes are absent", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect/></svg>`;
    const result = inspectImageDimensions(
      "image/svg+xml",
      new TextEncoder().encode(svg),
    );
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("reports svg-dimensions-not-declared when neither width/height nor viewBox is present", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
    const result = inspectImageDimensions(
      "image/svg+xml",
      new TextEncoder().encode(svg),
    );
    expect(result.width).toBeNull();
    expect(result.warnings).toContain("svg-dimensions-not-declared");
  });

  it("never invents AVIF dimensions", () => {
    const result = inspectImageDimensions("image/avif", new Uint8Array(20));
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.warnings).toContain("avif-dimension-detection-not-supported");
  });
});
