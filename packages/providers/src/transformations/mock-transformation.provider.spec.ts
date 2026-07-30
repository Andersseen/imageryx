import type { ImageOperation } from "@imageryx/contracts";
import { describe, expect, it } from "vitest";
import {
  MockTransformationFailureError,
  MockTransformationProvider,
} from "./mock-transformation.provider";

const RESIZE_OP: ImageOperation = {
  type: "resize",
  width: 320,
  height: 320,
  fit: "cover",
};

function baseInput(
  overrides: Partial<
    Parameters<MockTransformationProvider["transform"]>[0]
  > = {},
) {
  return {
    assetId: "asset-1",
    assetSlug: "hero-banner",
    sourceWidth: 1600,
    sourceHeight: 1200,
    sourceMimeType: "image/png",
    operations: [RESIZE_OP],
    outputFormat: "auto" as const,
    quality: 80,
    presetHash: "hash-abc",
    ...overrides,
  };
}

describe("MockTransformationProvider", () => {
  it("returns a deterministic, explicitly simulated result", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(baseInput());
    expect(result.simulated).toBe(true);
    expect(result.providerOperationId).toBe("mock-asset-1-hash-abc");
  });

  it("is fully deterministic for identical input", async () => {
    const provider = new MockTransformationProvider();
    const [a, b] = await Promise.all([
      provider.transform(baseInput()),
      provider.transform(baseInput()),
    ]);
    expect(a).toEqual(b);
  });

  it("derives exact dimensions from a resize with both width and height", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(
      baseInput({ operations: [RESIZE_OP] }),
    );
    expect(result.width).toBe(320);
    expect(result.height).toBe(320);
  });

  it("derives a proportional height from a width-only resize", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(
      baseInput({
        operations: [{ type: "resize", width: 800, fit: "scale-down" }],
        sourceWidth: 1600,
        sourceHeight: 1200,
      }),
    );
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('resolves "auto" output format to the configured mock format', async () => {
    const provider = new MockTransformationProvider({ autoFormat: "jpeg" });
    const result = await provider.transform(
      baseInput({ outputFormat: "auto" }),
    );
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("honors an explicit non-auto output format", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(baseInput({ outputFormat: "png" }));
    expect(result.mimeType).toBe("image/png");
  });

  it("calculates a deterministic simulated output size greater than zero", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(baseInput());
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("returns a local placeholder delivery URL, not a real asset", async () => {
    const provider = new MockTransformationProvider();
    const result = await provider.transform(baseInput());
    expect(result.deliveryUrl).toContain("/preview-placeholder");
    expect(result.storageKey).toBeNull();
  });

  it('deterministically fails when the asset slug contains "fail"', async () => {
    const provider = new MockTransformationProvider();
    await expect(
      provider.transform(baseInput({ assetSlug: "test-fail-case" })),
    ).rejects.toThrow(MockTransformationFailureError);
  });

  it('does not fail for a slug that does not contain "fail"', async () => {
    const provider = new MockTransformationProvider();
    await expect(
      provider.transform(baseInput({ assetSlug: "hero-banner" })),
    ).resolves.toBeTruthy();
  });

  it("reports full support for all documented operation types", () => {
    const provider = new MockTransformationProvider();
    const support = provider.supports(
      [RESIZE_OP, { type: "grayscale", enabled: true }],
      "webp",
    );
    expect(support.supported).toBe(true);
    expect(support.unsupportedOperations).toEqual([]);
  });

  it("rejects an invalid operation chain (duplicate types) before producing a result", async () => {
    const provider = new MockTransformationProvider();
    await expect(
      provider.transform(
        baseInput({
          operations: [
            { type: "quality", value: 80 },
            { type: "quality", value: 90 },
          ],
        }),
      ),
    ).rejects.toThrow();
  });
});
