import type { ImageAsset } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { buildDownloadOptions } from "./download-options";
import type { VariantView } from "./variant-view";

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

function view(overrides: Partial<VariantView> = {}): VariantView {
  return {
    variant: {
      id: "v1",
      assetId: "a",
      presetId: "preset-1",
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
    },
    presetName: "Thumbnail",
    presetSlug: "thumbnail",
    presetHashAbbreviation: "hash",
    deliveryUrl: "https://cdn.test/p/assets/hero/p/thumbnail",
    isSimulated: true,
    isPersisted: true,
    ...overrides,
  };
}

describe("buildDownloadOptions", () => {
  it("always includes the original first", () => {
    const options = buildDownloadOptions(asset(), []);
    expect(options[0]?.kind).toBe("original");
    expect(options[0]?.available).toBe(true);
  });

  it("marks the original unavailable, with a reason, when downloads are disabled", () => {
    const options = buildDownloadOptions(
      asset({ downloadOriginalEnabled: false }),
      [],
    );
    expect(options[0]?.available).toBe(false);
    expect(options[0]?.unavailableReason).toContain("disabled");
  });

  it("includes only ready variants, never pending/processing/failed ones", () => {
    const options = buildDownloadOptions(asset(), [
      view({ variant: { ...view().variant, id: "ready", status: "ready" } }),
      view({
        variant: { ...view().variant, id: "pending", status: "pending" },
      }),
      view({ variant: { ...view().variant, id: "failed", status: "failed" } }),
    ]);
    expect(options.map((o) => o.variantParam)).toEqual(["original", "ready"]);
  });

  it("highlights the download-high preset specifically", () => {
    const options = buildDownloadOptions(asset(), [
      view({
        presetSlug: "download-high",
        variant: { ...view().variant, id: "hq" },
      }),
      view({
        presetSlug: "thumbnail",
        variant: { ...view().variant, id: "thumb" },
      }),
    ]);
    expect(options.find((o) => o.variantParam === "hq")?.highlighted).toBe(
      true,
    );
    expect(options.find((o) => o.variantParam === "thumb")?.highlighted).toBe(
      false,
    );
  });

  it("uses the variant id as the download-url variant parameter", () => {
    const options = buildDownloadOptions(asset(), [view()]);
    expect(options[1]?.variantParam).toBe("v1");
  });
});
