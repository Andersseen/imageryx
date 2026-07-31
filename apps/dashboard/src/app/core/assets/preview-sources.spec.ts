import type { ImageVariant } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { buildPreviewSources } from "./preview-sources";
import type { VariantView } from "./variant-view";

function variant(overrides: Partial<ImageVariant> = {}): ImageVariant {
  return {
    id: "v1",
    assetId: "a",
    presetId: "p1",
    presetHash: "hash",
    provider: "mock",
    storageKey: "derived/x",
    deliveryUrl: null,
    mimeType: "image/svg+xml",
    width: 320,
    height: 180,
    sizeBytes: 4096,
    checksum: "b".repeat(64),
    status: "ready",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function view(overrides: Partial<VariantView> = {}): VariantView {
  return {
    variant: variant(),
    presetName: "Thumbnail",
    presetSlug: "thumbnail",
    presetHashAbbreviation: "hash",
    deliveryUrl: "https://cdn.test/p/assets/hero/p/thumbnail",
    isSimulated: true,
    isPersisted: true,
    ...overrides,
  };
}

describe("buildPreviewSources", () => {
  it("puts the original first when available", () => {
    const sources = buildPreviewSources(
      "https://cdn.test/original",
      1920,
      1080,
      [],
    );
    expect(sources[0]?.key).toBe("original");
    expect(sources[0]?.source.label).toBe("Original");
  });

  it("omits the original when there is no public URL for it", () => {
    const sources = buildPreviewSources(null, null, null, []);
    expect(sources).toHaveLength(0);
  });

  it("includes a variant only when it actually has a delivery URL", () => {
    const ready = view();
    const notReady = view({
      deliveryUrl: null,
      variant: variant({ id: "v2", status: "pending" }),
    });
    const sources = buildPreviewSources(null, null, null, [
      { view: ready, variant: ready.variant },
      { view: notReady, variant: notReady.variant },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.key).toBe("v1");
  });

  it("labels each variant option with its preset name", () => {
    const v = view({ presetName: "Hero" });
    const sources = buildPreviewSources(null, null, null, [
      { view: v, variant: v.variant },
    ]);
    expect(sources[0]?.source.label).toBe("Hero");
  });
});
