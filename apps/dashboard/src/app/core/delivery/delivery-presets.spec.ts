import type { AssetDetails } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { buildDeliveryPresetOptions } from "./delivery-presets";

function asset(overrides: Partial<AssetDetails> = {}): AssetDetails {
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
    tags: [],
    project: { id: "p", name: "Proj", slug: "proj" },
    folder: null,
    presets: [
      { id: "p1", name: "Thumbnail", slug: "thumbnail" },
      { id: "p2", name: "Hero", slug: "hero-preset" },
    ],
    variants: [
      {
        id: "v1",
        assetId: "a",
        presetId: "p1",
        presetHash: "hash",
        provider: "mock",
        storageKey: "derived/x",
        deliveryUrl: null,
        mimeType: "image/svg+xml",
        width: 320,
        height: 320,
        sizeBytes: 1024,
        checksum: "b".repeat(64),
        status: "ready",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    processingJobs: [],
    activity: [],
    delivery: null,
    duplicateCandidates: [],
    ...overrides,
  };
}

const buildUrl = (project: string, path: string, preset: string) =>
  `https://cdn.test/${project}/assets/${path}/p/${preset}`;

describe("buildDeliveryPresetOptions", () => {
  it("returns every project preset, not only ones with variants", () => {
    const options = buildDeliveryPresetOptions(asset(), buildUrl, "proj");
    expect(options).toHaveLength(2);
  });

  it("marks a preset with a ready variant as ready, with a real URL", () => {
    const options = buildDeliveryPresetOptions(asset(), buildUrl, "proj");
    const thumbnail = options.find((o) => o.slug === "thumbnail");
    expect(thumbnail?.ready).toBe(true);
    expect(thumbnail?.url).toBe(
      "https://cdn.test/proj/assets/hero/p/thumbnail",
    );
    expect(thumbnail?.width).toBe(320);
  });

  it("gives a preset with no variant yet a null URL rather than a link that 404s", () => {
    const options = buildDeliveryPresetOptions(asset(), buildUrl, "proj");
    const heroPreset = options.find((o) => o.slug === "hero-preset");
    expect(heroPreset?.ready).toBe(false);
    expect(heroPreset?.url).toBeNull();
  });

  it("treats a pending variant the same as no variant — not ready, no URL", () => {
    const withPending = asset({
      variants: [
        {
          id: "v1",
          assetId: "a",
          presetId: "p1",
          presetHash: "hash",
          provider: "mock",
          storageKey: null,
          deliveryUrl: null,
          mimeType: null,
          width: null,
          height: null,
          sizeBytes: null,
          checksum: null,
          status: "pending",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const options = buildDeliveryPresetOptions(withPending, buildUrl, "proj");
    expect(options.find((o) => o.slug === "thumbnail")?.ready).toBe(false);
  });
});
