import type { AssetListItem } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import {
  placeholderBackground,
  resolveThumbnailPreset,
  thumbnailFallbackLabel,
  thumbnailFallbackReason,
} from "./asset-thumbnail";

function asset(overrides: Partial<AssetListItem> = {}): AssetListItem {
  return {
    id: "asset-1",
    projectId: "project-1",
    folderId: null,
    name: "Hero",
    slug: "hero",
    path: "hero",
    storageKey: "originals/project-1/asset-1/original.png",
    originalFilename: "hero.png",
    mimeType: "image/png",
    extension: "png",
    width: 1920,
    height: 1080,
    aspectRatio: 1.7778,
    sizeBytes: 2048,
    checksum: "a".repeat(64),
    hasAlpha: false,
    dominantColor: "#336699",
    placeholder: "data:image/svg+xml,<svg/>",
    visibility: "public",
    processingStatus: "ready",
    downloadOriginalEnabled: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    tags: [],
    readyVariantCount: 1,
    readyPresetSlugs: ["thumbnail"],
    folder: null,
    ...overrides,
  };
}

describe("resolveThumbnailPreset", () => {
  it("uses a ready thumbnail variant for a public, ready asset", () => {
    expect(resolveThumbnailPreset(asset())).toBe("thumbnail");
  });

  it("prefers the smallest available preset", () => {
    expect(
      resolveThumbnailPreset(
        asset({ readyPresetSlugs: ["project-card", "avatar", "thumbnail"] }),
      ),
    ).toBe("thumbnail");
    expect(
      resolveThumbnailPreset(
        asset({ readyPresetSlugs: ["project-card", "avatar"] }),
      ),
    ).toBe("avatar");
  });

  it("ignores ready presets that are not usable as a thumbnail", () => {
    expect(
      resolveThumbnailPreset(
        asset({ readyPresetSlugs: ["hero", "download-high"] }),
      ),
    ).toBeNull();
  });

  it("never requests a URL for a private asset, whose delivery route always 404s", () => {
    expect(resolveThumbnailPreset(asset({ visibility: "private" }))).toBeNull();
  });

  it("never requests a URL for a soft-deleted asset", () => {
    expect(
      resolveThumbnailPreset(asset({ deletedAt: "2026-07-02T00:00:00.000Z" })),
    ).toBeNull();
  });

  it("never requests a URL before the asset is ready", () => {
    expect(
      resolveThumbnailPreset(asset({ processingStatus: "pending" })),
    ).toBeNull();
    expect(
      resolveThumbnailPreset(asset({ processingStatus: "processing" })),
    ).toBeNull();
    expect(
      resolveThumbnailPreset(asset({ processingStatus: "failed" })),
    ).toBeNull();
  });

  it("returns null when no variant is ready at all", () => {
    expect(resolveThumbnailPreset(asset({ readyPresetSlugs: [] }))).toBeNull();
  });
});

describe("thumbnailFallbackReason", () => {
  it("is null when a real thumbnail is available", () => {
    expect(thumbnailFallbackReason(asset())).toBeNull();
  });

  it("reports deletion ahead of every other reason", () => {
    expect(
      thumbnailFallbackReason(
        asset({ deletedAt: "2026-07-02T00:00:00.000Z", visibility: "private" }),
      ),
    ).toBe("deleted");
  });

  it("distinguishes private, processing, failed and missing-variant", () => {
    expect(thumbnailFallbackReason(asset({ visibility: "private" }))).toBe(
      "private",
    );
    expect(
      thumbnailFallbackReason(asset({ processingStatus: "pending" })),
    ).toBe("processing");
    expect(thumbnailFallbackReason(asset({ processingStatus: "failed" }))).toBe(
      "failed",
    );
    expect(thumbnailFallbackReason(asset({ readyPresetSlugs: [] }))).toBe(
      "no-variant",
    );
  });

  it("has a human label for every reason", () => {
    for (const reason of [
      "private",
      "deleted",
      "processing",
      "failed",
      "no-variant",
    ] as const) {
      expect(thumbnailFallbackLabel(reason).length).toBeGreaterThan(0);
    }
  });
});

describe("placeholderBackground", () => {
  it("prefers the generated placeholder data URI", () => {
    expect(placeholderBackground(asset())).toContain("data:image/svg+xml");
  });

  it("falls back to the dominant colour when there is no placeholder", () => {
    expect(placeholderBackground(asset({ placeholder: null }))).toBe("#336699");
  });

  it("returns null when the asset has neither", () => {
    expect(
      placeholderBackground(asset({ placeholder: null, dominantColor: null })),
    ).toBeNull();
  });
});
