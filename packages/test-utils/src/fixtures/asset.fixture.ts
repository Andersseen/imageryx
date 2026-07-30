import type { ImageAsset } from "@imageryx/contracts";

export function createAssetFixture(
  overrides: Partial<ImageAsset> = {},
): ImageAsset {
  const now = new Date().toISOString();
  const id = overrides.id ?? crypto.randomUUID();
  const projectId = overrides.projectId ?? crypto.randomUUID();
  const slug = overrides.slug ?? `test-asset-${id.slice(0, 8)}`;
  return {
    id,
    projectId,
    folderId: null,
    name: "Test Asset",
    slug,
    path: slug,
    storageKey: `originals/${projectId}/${id}/original.png`,
    originalFilename: "test-asset.png",
    mimeType: "image/png",
    extension: "png",
    width: 800,
    height: 600,
    aspectRatio: 1.3333,
    sizeBytes: 12345,
    checksum: "a".repeat(64),
    hasAlpha: false,
    dominantColor: "#ffffff",
    placeholder: null,
    visibility: "private",
    processingStatus: "ready",
    downloadOriginalEnabled: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
