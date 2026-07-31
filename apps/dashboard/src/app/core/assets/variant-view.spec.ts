import type { ImageVariant } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import {
  toVariantView,
  toVariantViews,
  type PresetLookup,
} from "./variant-view";

function variant(overrides: Partial<ImageVariant> = {}): ImageVariant {
  return {
    id: "variant-1",
    assetId: "asset-1",
    presetId: "preset-1",
    presetHash: "abcdef1234567890",
    provider: "mock",
    storageKey: "derived/p/a/hash.svg",
    deliveryUrl: null,
    mimeType: "image/svg+xml",
    width: 320,
    height: 320,
    sizeBytes: 1024,
    checksum: "a".repeat(64),
    status: "ready",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const presets: PresetLookup[] = [
  { id: "preset-1", name: "Thumbnail", slug: "thumbnail" },
];
const buildUrl = (project: string, asset: string, preset: string) =>
  `https://cdn.test/${project}/assets/${asset}/p/${preset}`;

describe("toVariantView", () => {
  it("joins a ready variant with its current preset name and a real delivery URL", () => {
    const view = toVariantView(variant(), presets, buildUrl, "proj", "hero");
    expect(view.presetName).toBe("Thumbnail");
    expect(view.presetSlug).toBe("thumbnail");
    expect(view.deliveryUrl).toBe(
      "https://cdn.test/proj/assets/hero/p/thumbnail",
    );
  });

  it("never builds a delivery URL for a variant that is not ready", () => {
    for (const status of ["pending", "processing", "failed"] as const) {
      const view = toVariantView(
        variant({ status }),
        presets,
        buildUrl,
        "proj",
        "hero",
      );
      expect(view.deliveryUrl).toBeNull();
    }
  });

  it("falls back to a placeholder name when the preset no longer resolves", () => {
    const view = toVariantView(
      variant({ presetId: "deleted-preset" }),
      presets,
      buildUrl,
      "p",
      "a",
    );
    expect(view.presetName).toBe("Unknown preset");
    expect(view.presetSlug).toBeNull();
    // Without a resolvable preset there is no slug to build a URL from, ready or not.
    expect(view.deliveryUrl).toBeNull();
  });

  it("abbreviates the preset hash to a stable short id", () => {
    const view = toVariantView(
      variant({ presetHash: "0123456789abcdef" }),
      presets,
      buildUrl,
      "p",
      "a",
    );
    expect(view.presetHashAbbreviation).toBe("0123456789");
  });

  it("flags the mock provider as simulated", () => {
    expect(
      toVariantView(variant({ provider: "mock" }), presets, buildUrl, "p", "a")
        .isSimulated,
    ).toBe(true);
    expect(
      toVariantView(
        variant({ provider: "cloudflare" }),
        presets,
        buildUrl,
        "p",
        "a",
      ).isSimulated,
    ).toBe(false);
  });

  it("reports persistence from whether a storage key exists", () => {
    expect(
      toVariantView(variant({ storageKey: null }), presets, buildUrl, "p", "a")
        .isPersisted,
    ).toBe(false);
    expect(
      toVariantView(
        variant({ storageKey: "derived/x" }),
        presets,
        buildUrl,
        "p",
        "a",
      ).isPersisted,
    ).toBe(true);
  });
});

describe("toVariantViews", () => {
  it("maps every variant in order", () => {
    const views = toVariantViews(
      [variant({ id: "v1" }), variant({ id: "v2", status: "pending" })],
      presets,
      buildUrl,
      "p",
      "a",
    );
    expect(views.map((v) => v.variant.id)).toEqual(["v1", "v2"]);
  });
});
