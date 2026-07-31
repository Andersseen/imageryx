import type { ImageAsset, ImageVariant } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { summarizeComparison } from "./comparison";

function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: "a",
    projectId: "p",
    folderId: null,
    name: "Hero",
    slug: "hero",
    path: "hero",
    storageKey: "originals/p/a/original.png",
    originalFilename: "hero.png",
    mimeType: "image/png",
    extension: "png",
    width: 1920,
    height: 1080,
    aspectRatio: 1.778,
    sizeBytes: 100_000,
    checksum: "a".repeat(64),
    hasAlpha: false,
    dominantColor: "#000000",
    placeholder: null,
    visibility: "public",
    processingStatus: "ready",
    downloadOriginalEnabled: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function variant(overrides: Partial<ImageVariant> = {}): ImageVariant {
  return {
    id: "v",
    assetId: "a",
    presetId: "preset-1",
    presetHash: "hash",
    provider: "mock",
    storageKey: "derived/p/a/hash.svg",
    deliveryUrl: null,
    mimeType: "image/svg+xml",
    width: 320,
    height: 180,
    sizeBytes: 40_000,
    checksum: "b".repeat(64),
    status: "ready",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeComparison", () => {
  it("computes percent saved for a smaller variant", () => {
    const summary = summarizeComparison(asset(), variant());
    expect(summary.percentSaved).toBe(60);
  });

  it("reports a negative percentage when the variant is larger", () => {
    const summary = summarizeComparison(
      asset({ sizeBytes: 10_000 }),
      variant({ sizeBytes: 40_000 }),
    );
    expect(summary.percentSaved).toBe(-300);
  });

  it("does not fabricate a percentage while the variant size is still unknown", () => {
    const summary = summarizeComparison(asset(), variant({ sizeBytes: null }));
    expect(summary.percentSaved).toBeNull();
    expect(summary.variantSizeBytes).toBeNull();
  });

  it("avoids dividing by zero for a zero-byte original", () => {
    const summary = summarizeComparison(asset({ sizeBytes: 0 }), variant());
    expect(summary.percentSaved).toBeNull();
  });

  it("carries both sets of dimensions through unchanged", () => {
    const summary = summarizeComparison(asset(), variant());
    expect(summary.originalDimensions).toEqual({ width: 1920, height: 1080 });
    expect(summary.variantDimensions).toEqual({ width: 320, height: 180 });
  });

  it("flags the mock provider as simulated, real providers as not", () => {
    expect(
      summarizeComparison(asset(), variant({ provider: "mock" })).isSimulated,
    ).toBe(true);
    expect(
      summarizeComparison(asset(), variant({ provider: "cloudinary" }))
        .isSimulated,
    ).toBe(false);
  });
});
