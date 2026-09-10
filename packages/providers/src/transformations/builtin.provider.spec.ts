import { UnsupportedOperationError } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import { BuiltinTransformationProvider } from "./builtin.provider";
import type { TransformationInput } from "./transformation-provider";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- c --><script>alert(1)</script><rect width="10" height="10"/></svg>`;

function baseInput(
  overrides: Partial<TransformationInput> = {},
): TransformationInput {
  return {
    assetId: "asset-1",
    assetSlug: "logo",
    sourceBytes: new TextEncoder().encode(SAMPLE_SVG),
    sourceWidth: 10,
    sourceHeight: 10,
    sourceMimeType: "image/svg+xml",
    operations: [{ type: "svgOptimize" }],
    outputFormat: "svg",
    quality: null,
    presetHash: "hash123",
    ...overrides,
  };
}

describe("BuiltinTransformationProvider capabilities", () => {
  it("supports svgOptimize + svg output only", () => {
    const provider = new BuiltinTransformationProvider();
    expect(provider.supports([{ type: "svgOptimize" }], "svg").supported).toBe(
      true,
    );
    expect(
      provider.supports([{ type: "resize", width: 100, fit: "cover" }], "svg")
        .supported,
    ).toBe(false);
    expect(provider.supports([{ type: "svgOptimize" }], "webp").supported).toBe(
      false,
    );
  });
});

describe("BuiltinTransformationProvider.transform", () => {
  it("returns real, non-simulated optimized SVG bytes", async () => {
    const provider = new BuiltinTransformationProvider();
    const result = await provider.transform(baseInput());

    expect(result.simulated).toBe(false);
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.bytes).not.toBeNull();
    const svg = new TextDecoder().decode(result.bytes as Uint8Array);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<!--");
    expect(result.sizeBytes).toBeLessThan(baseInput().sourceBytes!.byteLength);
    expect(result.checksum).toHaveLength(64);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it("passes svgOptimize operation options through to the optimizer", async () => {
    const provider = new BuiltinTransformationProvider();
    const withComment = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- keep --><rect width="10" height="10"/></svg>`;
    const result = await provider.transform(
      baseInput({
        sourceBytes: new TextEncoder().encode(withComment),
        operations: [{ type: "svgOptimize", removeComments: false }],
      }),
    );
    const svg = new TextDecoder().decode(result.bytes as Uint8Array);
    expect(svg).toContain("keep");
  });

  it("rejects a raster operation", async () => {
    await expect(
      provider().transform(
        baseInput({
          operations: [{ type: "resize", width: 100, fit: "cover" }],
        }),
      ),
    ).rejects.toThrow(UnsupportedOperationError);
  });

  it("rejects a non-svg output format", async () => {
    await expect(
      provider().transform(baseInput({ outputFormat: "webp" })),
    ).rejects.toThrow(UnsupportedOperationError);
  });

  it("rejects missing source bytes", async () => {
    await expect(
      provider().transform(baseInput({ sourceBytes: undefined })),
    ).rejects.toThrow();
  });
});

function provider(): BuiltinTransformationProvider {
  return new BuiltinTransformationProvider();
}
